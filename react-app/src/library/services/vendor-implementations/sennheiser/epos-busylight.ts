// Direct WebHID control of the EPOS/Sennheiser UI 20 BL USB busylight. This protocol
// is not vendor-documented; it was reverse engineered by a third party and published
// at https://github.com/EthyMoney/Sennheiser-EPOS-USB-BusyLight-Control (led.js,
// speaker.js). Firmware or EPOS Connect updates could silently change or break it, so
// every write here is best-effort and isolated from SennheiserService's loopback
// call-control connection: a busylight failure can never affect D10 answer/hangup.

export const EPOS_BUSYLIGHT_VENDOR_ID = 0x1395; // 5013 - Sennheiser Communications
export const EPOS_BUSYLIGHT_PRODUCT_ID = 0x0074; // 116 - UI 20 BL USB

const REPORT_ID = 0x01;
const LED_HEADER = [0x12, 0x02];
const LED_FALLBACK_LENGTH = 73; // reverse-engineered payload length, excluding the report ID byte
const RINGER_VOLUME_HEADER = [0x04, 0x06];
const RINGER_TRIGGER_HEADER = [0x09, 0x04, 0x01, 0x03, 0x01];
const RINGER_FALLBACK_LENGTH = 63;

export const BUSYLIGHT_BLINK_INTERVAL_MS = 500;

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
    outputReports?: EposHidReport[];
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

function getHid (): EposHid | undefined {
  return (typeof navigator === 'undefined' ? undefined : (navigator as unknown as { hid?: EposHid }).hid);
}

function resolveOutputReportByteLength (device: EposHidDevice, reportId: number): number | undefined {
  for (const collection of device.collections ?? []) {
    const report = (collection.outputReports ?? []).find(item => item.reportId === reportId);
    if (!report) continue;
    const bits = (report.items ?? []).reduce(
      (sum, item) => sum + (item.reportSize ?? 0) * (item.reportCount ?? 0), 0,
    );
    if (bits > 0) return Math.ceil(bits / 8);
  }
  return undefined;
}

function buildReport (header: number[], length: number): Uint8Array {
  const data = new Uint8Array(length);
  data.set(header.slice(0, length));
  return data;
}

export class EposBusylightController {
    private device: EposHidDevice | null = null;
    private ledReportLength = LED_FALLBACK_LENGTH;
    private ringerReportLength = RINGER_FALLBACK_LENGTH;
    private blinkHandle: ReturnType<typeof setInterval> | null = null;
    private currentPhase: BusylightPhase = 'idle';

    static isSupported (): boolean {
      return !!getHid();
    }

    /** Must be called synchronously from a user-gesture handler (WebHID requirement). */
    static async requestDevice (): Promise<EposHidDevice | undefined> {
      const hid = getHid();
      if (!hid) return undefined;
      const [device] = await hid.requestDevice({
        filters: [{ vendorId: EPOS_BUSYLIGHT_VENDOR_ID, productId: EPOS_BUSYLIGHT_PRODUCT_ID }],
      });
      return device;
    }

    /** Devices already granted in a previous session; safe to call without a user gesture. */
    static async findGrantedDevice (): Promise<EposHidDevice | undefined> {
      const hid = getHid();
      if (!hid) return undefined;
      const devices = await hid.getDevices();
      return devices.find(
        device => device.vendorId === EPOS_BUSYLIGHT_VENDOR_ID && device.productId === EPOS_BUSYLIGHT_PRODUCT_ID,
      );
    }

    get isConnected (): boolean {
      return !!this.device?.opened;
    }

    async connect (device: EposHidDevice): Promise<void> {
      if (!device.opened) await device.open();
      this.device = device;
      this.ledReportLength = resolveOutputReportByteLength(device, REPORT_ID) ?? LED_FALLBACK_LENGTH;
      this.ringerReportLength = resolveOutputReportByteLength(device, REPORT_ID) ?? RINGER_FALLBACK_LENGTH;
    }

    async disconnect (): Promise<void> {
      this.stopBlink();
      const device = this.device;
      this.device = null;
      this.currentPhase = 'idle';
      if (device?.opened) await device.close();
    }

    private stopBlink (): void {
      if (this.blinkHandle !== null) {
        clearInterval(this.blinkHandle);
        this.blinkHandle = null;
      }
    }

    private async sendColor (color: BusylightColor | null): Promise<void> {
      if (!this.device?.opened) return;
      const { red = 0, green = 0, blue = 0 } = color ?? {};
      const on = color !== null;
      const report = buildReport(
        [...LED_HEADER, red, green, blue, red, green, blue, on ? 0x01 : 0x00],
        this.ledReportLength,
      );
      await this.device.sendReport(REPORT_ID, report);
    }

    /** Solid color for busy/held, blinking for ringing, off for idle. Best-effort. */
    async setPhase (phase: BusylightPhase, colors: BusylightColorScheme = DEFAULT_BUSYLIGHT_COLORS): Promise<void> {
      this.stopBlink();
      this.currentPhase = phase;
      if (phase === 'idle') {
        await this.sendColor(null);
        return;
      }
      if (phase === 'ringing') {
        let lit = true;
        await this.sendColor(colors.ringing);
        this.blinkHandle = setInterval(() => {
          lit = !lit;
          void this.sendColor(lit ? colors.ringing : null);
        }, BUSYLIGHT_BLINK_INTERVAL_MS);
        return;
      }
      await this.sendColor(phase === 'held' ? colors.held : colors.busy);
    }

    get phase (): BusylightPhase {
      return this.currentPhase;
    }

    async ring (): Promise<void> {
      if (!this.device?.opened) return;
      await this.device.sendReport(REPORT_ID, buildReport(RINGER_VOLUME_HEADER, this.ringerReportLength));
      await this.device.sendReport(REPORT_ID, buildReport(RINGER_TRIGGER_HEADER, this.ringerReportLength));
    }
}
