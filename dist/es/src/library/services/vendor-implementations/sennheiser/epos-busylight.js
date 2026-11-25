// Direct WebHID control of the EPOS/Sennheiser UI 20 BL USB busylight. This protocol
// is not vendor-documented; it was reverse engineered by a third party and published
// at https://github.com/EthyMoney/Sennheiser-EPOS-USB-BusyLight-Control (led.js,
// speaker.js). Firmware or EPOS Connect updates could silently change or break it, so
// every write here is best-effort and isolated from SennheiserService's loopback
// call-control connection: a busylight failure can never affect D10 answer/hangup.
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
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
export const DEFAULT_BUSYLIGHT_COLORS = {
    ringing: { red: 0xc0, green: 0xc0, blue: 0x00 },
    busy: { red: 0xc0, green: 0x00, blue: 0x00 },
    held: { red: 0x00, green: 0x00, blue: 0xc0 },
};
const FALLBACK_FRAMING = {
    reportId: REPORT_ID,
    prefix: [],
    ledLength: LED_FALLBACK_LENGTH,
    ringerLength: RINGER_FALLBACK_LENGTH,
};
function getHid() {
    return (typeof navigator === 'undefined' ? undefined : navigator.hid);
}
function isBusylight(device) {
    return device.vendorId === EPOS_BUSYLIGHT_VENDOR_ID && device.productId === EPOS_BUSYLIGHT_PRODUCT_ID;
}
function findOutputReport(device, reportId) {
    var _a, _b;
    for (const collection of (_a = device.collections) !== null && _a !== void 0 ? _a : []) {
        const report = ((_b = collection.outputReports) !== null && _b !== void 0 ? _b : []).find(item => item.reportId === reportId);
        if (report)
            return report;
    }
    return undefined;
}
function reportByteLength(report) {
    var _a;
    const bits = ((_a = report === null || report === void 0 ? void 0 : report.items) !== null && _a !== void 0 ? _a : []).reduce((sum, item) => { var _a, _b; return sum + ((_a = item.reportSize) !== null && _a !== void 0 ? _a : 0) * ((_b = item.reportCount) !== null && _b !== void 0 ? _b : 0); }, 0);
    return bits > 0 ? Math.ceil(bits / 8) : undefined;
}
function resolveFraming(device) {
    var _a;
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
            ledLength: length !== null && length !== void 0 ? length : LED_FALLBACK_LENGTH + 1,
            ringerLength: length !== null && length !== void 0 ? length : RINGER_FALLBACK_LENGTH + 1,
        };
    }
    if (((_a = device.collections) !== null && _a !== void 0 ? _a : []).some(collection => { var _a; return ((_a = collection.outputReports) !== null && _a !== void 0 ? _a : []).length > 0; })) {
        throw new Error(`UI 20 BL interface has no usable output report: ${EposBusylightController.describeDevice(device)}`);
    }
    // No descriptor information at all (never seen from Chromium): trust the reference.
    return FALLBACK_FRAMING;
}
function buildReport(bytes, length) {
    const data = new Uint8Array(length);
    data.set(bytes.slice(0, length));
    return data;
}
function hex(value) {
    return value === undefined ? '?' : `0x${value.toString(16)}`;
}
function describeReports(label, reports) {
    if (!(reports === null || reports === void 0 ? void 0 : reports.length))
        return '';
    return ` ${label}=${reports.map(report => { var _a; return `${report.reportId}:${(_a = reportByteLength(report)) !== null && _a !== void 0 ? _a : '?'}B`; }).join(',')}`;
}
function toError(error) {
    return error instanceof Error ? error : new Error(String(error));
}
export class EposBusylightController {
    constructor(options = {}) {
        this.options = options;
        this.device = null;
        this.framing = FALLBACK_FRAMING;
        this.timerHandle = null;
        this.currentPhase = 'idle';
        this.writeQueue = Promise.resolve();
        this.failing = false;
    }
    static isSupported() {
        return !!getHid();
    }
    /**
     * WebHID can expose one physical device as several HIDDevice objects (one per HID
     * interface). Prefer the one that declares the LED output report instead of
     * whichever happens to be listed first.
     */
    static pickDevice(devices) {
        var _a, _b;
        const candidates = devices.filter(isBusylight);
        return (_b = (_a = candidates.find(device => findOutputReport(device, REPORT_ID))) !== null && _a !== void 0 ? _a : candidates.find(device => findOutputReport(device, UNNUMBERED_REPORT_ID))) !== null && _b !== void 0 ? _b : candidates[0];
    }
    /** Compact HID layout summary, safe to put in diagnostics. */
    static describeDevice(device) {
        var _a;
        const collections = ((_a = device.collections) !== null && _a !== void 0 ? _a : []).map(collection => `[page=${hex(collection.usagePage)} usage=${hex(collection.usage)}` +
            `${describeReports('in', collection.inputReports)}` +
            `${describeReports('out', collection.outputReports)}` +
            `${describeReports('feat', collection.featureReports)}]`);
        return `${hex(device.vendorId)}:${hex(device.productId)} ${collections.join(' ') || '[no collections]'}`;
    }
    /** Must be called synchronously from a user-gesture handler (WebHID requirement). */
    static requestDevice() {
        return __awaiter(this, void 0, void 0, function* () {
            const hid = getHid();
            if (!hid)
                return undefined;
            const devices = yield hid.requestDevice({
                filters: [{ vendorId: EPOS_BUSYLIGHT_VENDOR_ID, productId: EPOS_BUSYLIGHT_PRODUCT_ID }],
            });
            return EposBusylightController.pickDevice(devices);
        });
    }
    /** Devices already granted in a previous session; safe to call without a user gesture. */
    static findGrantedDevice() {
        return __awaiter(this, void 0, void 0, function* () {
            const hid = getHid();
            if (!hid)
                return undefined;
            return EposBusylightController.pickDevice(yield hid.getDevices());
        });
    }
    get isConnected() {
        var _a;
        return !!((_a = this.device) === null || _a === void 0 ? void 0 : _a.opened);
    }
    get deviceSummary() {
        return this.device ? EposBusylightController.describeDevice(this.device) : undefined;
    }
    connect(device) {
        return __awaiter(this, void 0, void 0, function* () {
            const framing = resolveFraming(device);
            if (!device.opened)
                yield device.open();
            this.device = device;
            this.framing = framing;
            this.failing = false;
        });
    }
    disconnect() {
        return __awaiter(this, void 0, void 0, function* () {
            this.stopTimer();
            const device = this.device;
            this.device = null;
            this.currentPhase = 'idle';
            if (device === null || device === void 0 ? void 0 : device.opened)
                yield device.close();
        });
    }
    stopTimer() {
        if (this.timerHandle !== null) {
            clearInterval(this.timerHandle);
            this.timerHandle = null;
        }
    }
    // Writes are serialized so timer-driven re-sends can never interleave with a
    // phase change, and every failure is reported instead of being dropped.
    write(payload, length) {
        const device = this.device;
        if (!(device === null || device === void 0 ? void 0 : device.opened))
            return Promise.resolve();
        const { reportId, prefix } = this.framing;
        const data = buildReport([...prefix, ...payload], length);
        const result = this.writeQueue.then(() => device.sendReport(reportId, data));
        this.writeQueue = result.then(() => {
            var _a, _b;
            if (this.failing) {
                this.failing = false;
                (_b = (_a = this.options).onWriteRecovered) === null || _b === void 0 ? void 0 : _b.call(_a);
            }
        }, error => {
            var _a, _b;
            this.failing = true;
            (_b = (_a = this.options).onWriteError) === null || _b === void 0 ? void 0 : _b.call(_a, toError(error));
        });
        return result;
    }
    sendColor(color) {
        const { red = 0, green = 0, blue = 0 } = color !== null && color !== void 0 ? color : {};
        const on = color !== null;
        return this.write([...LED_HEADER, red, green, blue, red, green, blue, on ? 0x01 : 0x00], this.framing.ledLength);
    }
    repeat(intervalMs, send) {
        this.timerHandle = setInterval(() => {
            send().catch(() => undefined); // already reported through onWriteError
        }, intervalMs);
    }
    /** Blinking for ringing, solid (periodically re-sent) for busy/held, off for idle. */
    setPhase(phase_1) {
        return __awaiter(this, arguments, void 0, function* (phase, colors = DEFAULT_BUSYLIGHT_COLORS) {
            var _a;
            this.stopTimer();
            this.currentPhase = phase;
            if (phase === 'idle') {
                yield this.sendColor(null);
                return;
            }
            if (phase === 'ringing') {
                let lit = true;
                this.repeat(BUSYLIGHT_BLINK_INTERVAL_MS, () => {
                    lit = !lit;
                    return this.sendColor(lit ? colors.ringing : null);
                });
                yield this.sendColor(colors.ringing);
                return;
            }
            const color = phase === 'held' ? colors.held : colors.busy;
            this.repeat((_a = this.options.reassertIntervalMs) !== null && _a !== void 0 ? _a : BUSYLIGHT_REASSERT_INTERVAL_MS, () => this.sendColor(color));
            yield this.sendColor(color);
        });
    }
    get phase() {
        return this.currentPhase;
    }
    ring() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.write(RINGER_VOLUME_HEADER, this.framing.ringerLength);
            yield this.write(RINGER_TRIGGER_HEADER, this.framing.ringerLength);
        });
    }
}
//# sourceMappingURL=epos-busylight.js.map