// Direct WebHID control of the EPOS/Sennheiser UI 20 BL USB busylight. This protocol
// is not vendor-documented; it was reverse engineered by a third party and published
// at https://github.com/EthyMoney/Sennheiser-EPOS-USB-BusyLight-Control (led.js,
// speaker.js). Firmware or EPOS Connect updates could silently change or break it, so
// every write here is best-effort and isolated from SennheiserService's loopback
// call-control connection: a busylight failure can never affect D10 answer/hangup.

export const EPOS_BUSYLIGHT_VENDOR_ID = 0x1395; // 5013 - Sennheiser Communications
export const EPOS_BUSYLIGHT_PRODUCT_ID = 0x0074; // 116 - UI 20 BL USB

// The reference sends `0x01, <payload>` through node-hid, where the leading byte is the
// report ID on a numbered descriptor. If the device turns out to declare no report IDs,
// the same bytes go out as report 0 with 0x01 kept as the first payload byte.
const REPORT_ID = 0x01;
const UNNUMBERED_REPORT_ID = 0x00;
const LED_HEADER = [0x12, 0x02];
const LED_FALLBACK_LENGTH = 73; // reverse-engineered payload length, excluding the report ID byte
const RINGER_VOLUME_HEADER = [0x04, 0x06];
const RINGER_TRIGGER_HEADER = [0x09, 0x04, 0x01, 0x03, 0x01];
const RINGER_FALLBACK_LENGTH = 63;

export const BUSYLIGHT_BLINK_INTERVAL_MS = 500;
// EPOS Connect also drives the UI 20 BL and may repaint it with its own presence
// color, so solid phases are re-sent periodically instead of written once.
export const BUSYLIGHT_REASSERT_INTERVAL_MS = 2000;

export interface BusylightColor {
    red: number;
    green: number;
    blue: number;
}

export type BusylightPhase = 'idle' | 'ringing' | 'busy' | 'held';

export interface BusylightColorScheme {
    ringing: BusylightColor;
    busy: BusylightColor;
    held: BusylightColor;
}

export const DEFAULT_BUSYLIGHT_COLORS: BusylightColorScheme = {
  ringing: { red: 0xc0, green: 0xc0, blue: 0x00 },
  busy: { red: 0xc0, green: 0x00, blue: 0x00 },
  held: { red: 0x00, green: 0x00, blue: 0xc0 },
};

interface EposHidReportItem {
    reportSize?: number;
    reportCount?: number;
}

interface EposHidReport {
    reportId: number;
    items?: EposHidReportItem[];
}

interface EposHidCollection {
    usagePage?: number;
    usage?: number;
    inputReports?: EposHidReport[];
    outputReports?: EposHidReport[];
    featureReports?: EposHidReport[];
}

export interface EposHidDevice {
    opened: boolean;
    vendorId: number;
    productId: number;
    collections: EposHidCollection[];
    open(): Promise<void>;
    close(): Promise<void>;
    sendReport(reportId: number, data: BufferSource): Promise<void>;
}

interface EposHid {
    requestDevice(options: { filters: Array<{ vendorId: number; productId?: number }> }): Promise<EposHidDevice[]>;
    getDevices(): Promise<EposHidDevice[]>;
}

export interface EposBusylightControllerOptions {
    /** Every failed write, including timer-driven blink and re-assert writes. */
    onWriteError?: (error: Error) => void;
    /** The first successful write after one or more failures. */
    onWriteRecovered?: () => void;
    reassertIntervalMs?: number;
}

interface ReportFraming {
    reportId: number;
    prefix: number[];
    ledLength: number;
    ringerLength: number;
}

const FALLBACK_FRAMING: ReportFraming = {
  reportId: REPORT_ID,
  prefix: [],
  ledLength: LED_FALLBACK_LENGTH,
  ringerLength: RINGER_FALLBACK_LENGTH,
};

function getHid (): EposHid | undefined {
  return (typeof navigator === 'undefined' ? undefined : (navigator as unknown as { hid?: EposHid }).hid);
}

function isBusylight (device: EposHidDevice): boolean {
  return device.vendorId === EPOS_BUSYLIGHT_VENDOR_ID && device.productId === EPOS_BUSYLIGHT_PRODUCT_ID;
}

function findOutputReport (device: EposHidDevice, reportId: number): EposHidReport | undefined {
  for (const collection of device.collections ?? []) {
    const report = (collection.outputReports ?? []).find(item => item.reportId === reportId);
    if (report) return report;
  }
  return undefined;
}

function reportByteLength (report: EposHidReport | undefined): number | undefined {
  const bits = (report?.items ?? []).reduce(
    (sum, item) => sum + (item.reportSize ?? 0) * (item.reportCount ?? 0), 0,
  );
  return bits > 0 ? Math.ceil(bits / 8) : undefined;
}

function resolveFraming (device: EposHidDevice): ReportFraming {
  const numbered = findOutputReport(device, REPORT_ID);
  if (numbered) {
    const length = reportByteLength(numbered);
    return length
      ? { reportId: REPORT_ID, prefix: [], ledLength: length, ringerLength: length }
      : FALLBACK_FRAMING;
  }
  const unnumbered = findOutputReport(device, UNNUMBERED_REPORT_ID);
  if (unnumbered) {
    const length = reportByteLength(unnumbered);
    return {
      reportId: UNNUMBERED_REPORT_ID,
      prefix: [REPORT_ID],
      ledLength: length ?? LED_FALLBACK_LENGTH + 1,
      ringerLength: length ?? RINGER_FALLBACK_LENGTH + 1,
    };
  }
  if ((device.collections ?? []).some(collection => (collection.outputReports ?? []).length > 0)) {
    throw new Error(
      `UI 20 BL interface has no usable output report: ${EposBusylightController.describeDevice(device)}`,
    );
  }
  // No descriptor information at all (never seen from Chromium): trust the reference.
  return FALLBACK_FRAMING;
}

function buildReport (bytes: number[], length: number): Uint8Array<ArrayBuffer> {
  const data = new Uint8Array(length);
  data.set(bytes.slice(0, length));
  return data;
}

function hex (value: number | undefined): string {
  return value === undefined ? '?' : `0x${value.toString(16)}`;
}

function describeReports (label: string, reports: EposHidReport[] | undefined): string {
  if (!reports?.length) return '';
  return ` ${label}=${reports.map(report => `${report.reportId}:${reportByteLength(report) ?? '?'}B`).join(',')}`;
}

function toError (error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export class EposBusylightController {
    private device: EposHidDevice | null = null;
    private framing: ReportFraming = FALLBACK_FRAMING;
    private timerHandle: ReturnType<typeof setInterval> | null = null;
    private currentPhase: BusylightPhase = 'idle';
    private writeQueue: Promise<void> = Promise.resolve();
    private failing = false;

    constructor (private readonly options: EposBusylightControllerOptions = {}) {}

    static isSupported (): boolean {
      return !!getHid();
    }

    /**
     * WebHID can expose one physical device as several HIDDevice objects (one per HID
     * interface). Prefer the one that declares the LED output report instead of
     * whichever happens to be listed first.
     */
    static pickDevice (devices: EposHidDevice[]): EposHidDevice | undefined {
      const candidates = devices.filter(isBusylight);
      return candidates.find(device => findOutputReport(device, REPORT_ID))
        ?? candidates.find(device => findOutputReport(device, UNNUMBERED_REPORT_ID))
        ?? candidates[0];
    }

    /** Compact HID layout summary, safe to put in diagnostics. */
    static describeDevice (device: EposHidDevice): string {
      const collections = (device.collections ?? []).map(collection =>
        `[page=${hex(collection.usagePage)} usage=${hex(collection.usage)}` +
        `${describeReports('in', collection.inputReports)}` +
        `${describeReports('out', collection.outputReports)}` +
        `${describeReports('feat', collection.featureReports)}]`,
      );
      return `${hex(device.vendorId)}:${hex(device.productId)} ${collections.join(' ') || '[no collections]'}`;
    }

    /** Must be called synchronously from a user-gesture handler (WebHID requirement). */
    static async requestDevice (): Promise<EposHidDevice | undefined> {
      const hid = getHid();
      if (!hid) return undefined;
      const devices = await hid.requestDevice({
        filters: [{ vendorId: EPOS_BUSYLIGHT_VENDOR_ID, productId: EPOS_BUSYLIGHT_PRODUCT_ID }],
      });
      return EposBusylightController.pickDevice(devices);
    }

    /** Devices already granted in a previous session; safe to call without a user gesture. */
    static async findGrantedDevice (): Promise<EposHidDevice | undefined> {
      const hid = getHid();
      if (!hid) return undefined;
      return EposBusylightController.pickDevice(await hid.getDevices());
    }

    get isConnected (): boolean {
      return !!this.device?.opened;
    }

    get deviceSummary (): string | undefined {
      return this.device ? EposBusylightController.describeDevice(this.device) : undefined;
    }

    async connect (device: EposHidDevice): Promise<void> {
      const framing = resolveFraming(device);
      if (!device.opened) await device.open();
      this.device = device;
      this.framing = framing;
      this.failing = false;
    }

    async disconnect (): Promise<void> {
      this.stopTimer();
      const device = this.device;
      this.device = null;
      this.currentPhase = 'idle';
      if (device?.opened) await device.close();
    }

    private stopTimer (): void {
      if (this.timerHandle !== null) {
        clearInterval(this.timerHandle);
        this.timerHandle = null;
      }
    }

    // Writes are serialized so timer-driven re-sends can never interleave with a
    // phase change, and every failure is reported instead of being dropped.
    private write (payload: number[], length: number): Promise<void> {
      const device = this.device;
      if (!device?.opened) return Promise.resolve();
      const { reportId, prefix } = this.framing;
      const data = buildReport([...prefix, ...payload], length);
      const result = this.writeQueue.then(() => device.sendReport(reportId, data));
      this.writeQueue = result.then(() => {
        if (this.failing) {
          this.failing = false;
          this.options.onWriteRecovered?.();
        }
      }, error => {
        this.failing = true;
        this.options.onWriteError?.(toError(error));
      });
      return result;
    }

    private sendColor (color: BusylightColor | null): Promise<void> {
      const { red = 0, green = 0, blue = 0 } = color ?? {};
      const on = color !== null;
      return this.write([...LED_HEADER, red, green, blue, red, green, blue, on ? 0x01 : 0x00], this.framing.ledLength);
    }

    private repeat (intervalMs: number, send: () => Promise<void>): void {
      this.timerHandle = setInterval(() => {
        send().catch(() => undefined); // already reported through onWriteError
      }, intervalMs);
    }

    /** Blinking for ringing, solid (periodically re-sent) for busy/held, off for idle. */
    async setPhase (phase: BusylightPhase, colors: BusylightColorScheme = DEFAULT_BUSYLIGHT_COLORS): Promise<void> {
      this.stopTimer();
      this.currentPhase = phase;
      if (phase === 'idle') {
        await this.sendColor(null);
        return;
      }
      if (phase === 'ringing') {
        let lit = true;
        this.repeat(BUSYLIGHT_BLINK_INTERVAL_MS, () => {
          lit = !lit;
          return this.sendColor(lit ? colors.ringing : null);
        });
        await this.sendColor(colors.ringing);
        return;
      }
      const color = phase === 'held' ? colors.held : colors.busy;
      this.repeat(this.options.reassertIntervalMs ?? BUSYLIGHT_REASSERT_INTERVAL_MS, () => this.sendColor(color));
      await this.sendColor(color);
    }

    get phase (): BusylightPhase {
      return this.currentPhase;
    }

    async ring (): Promise<void> {
      await this.write(RINGER_VOLUME_HEADER, this.framing.ringerLength);
      await this.write(RINGER_TRIGGER_HEADER, this.framing.ringerLength);
    }
}
