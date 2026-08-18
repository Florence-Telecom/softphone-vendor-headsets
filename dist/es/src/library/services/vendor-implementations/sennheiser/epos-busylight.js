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
const REPORT_ID = 0x01;
const LED_HEADER = [0x12, 0x02];
const LED_FALLBACK_LENGTH = 73; // reverse-engineered payload length, excluding the report ID byte
const RINGER_VOLUME_HEADER = [0x04, 0x06];
const RINGER_TRIGGER_HEADER = [0x09, 0x04, 0x01, 0x03, 0x01];
const RINGER_FALLBACK_LENGTH = 63;
export const BUSYLIGHT_BLINK_INTERVAL_MS = 500;
export const DEFAULT_BUSYLIGHT_COLORS = {
    ringing: { red: 0xc0, green: 0xc0, blue: 0x00 },
    busy: { red: 0xc0, green: 0x00, blue: 0x00 },
    held: { red: 0x00, green: 0x00, blue: 0xc0 },
};
function getHid() {
    return (typeof navigator === 'undefined' ? undefined : navigator.hid);
}
function resolveOutputReportByteLength(device, reportId) {
    var _a, _b, _c;
    for (const collection of (_a = device.collections) !== null && _a !== void 0 ? _a : []) {
        const report = ((_b = collection.outputReports) !== null && _b !== void 0 ? _b : []).find(item => item.reportId === reportId);
        if (!report)
            continue;
        const bits = ((_c = report.items) !== null && _c !== void 0 ? _c : []).reduce((sum, item) => { var _a, _b; return sum + ((_a = item.reportSize) !== null && _a !== void 0 ? _a : 0) * ((_b = item.reportCount) !== null && _b !== void 0 ? _b : 0); }, 0);
        if (bits > 0)
            return Math.ceil(bits / 8);
    }
    return undefined;
}
function buildReport(header, length) {
    const data = new Uint8Array(length);
    data.set(header.slice(0, length));
    return data;
}
export class EposBusylightController {
    constructor() {
        this.device = null;
        this.ledReportLength = LED_FALLBACK_LENGTH;
        this.ringerReportLength = RINGER_FALLBACK_LENGTH;
        this.blinkHandle = null;
        this.currentPhase = 'idle';
    }
    static isSupported() {
        return !!getHid();
    }
    /** Must be called synchronously from a user-gesture handler (WebHID requirement). */
    static requestDevice() {
        return __awaiter(this, void 0, void 0, function* () {
            const hid = getHid();
            if (!hid)
                return undefined;
            const [device] = yield hid.requestDevice({
                filters: [{ vendorId: EPOS_BUSYLIGHT_VENDOR_ID, productId: EPOS_BUSYLIGHT_PRODUCT_ID }],
            });
            return device;
        });
    }
    /** Devices already granted in a previous session; safe to call without a user gesture. */
    static findGrantedDevice() {
        return __awaiter(this, void 0, void 0, function* () {
            const hid = getHid();
            if (!hid)
                return undefined;
            const devices = yield hid.getDevices();
            return devices.find(device => device.vendorId === EPOS_BUSYLIGHT_VENDOR_ID && device.productId === EPOS_BUSYLIGHT_PRODUCT_ID);
        });
    }
    get isConnected() {
        var _a;
        return !!((_a = this.device) === null || _a === void 0 ? void 0 : _a.opened);
    }
    connect(device) {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
            if (!device.opened)
                yield device.open();
            this.device = device;
            this.ledReportLength = (_a = resolveOutputReportByteLength(device, REPORT_ID)) !== null && _a !== void 0 ? _a : LED_FALLBACK_LENGTH;
            this.ringerReportLength = (_b = resolveOutputReportByteLength(device, REPORT_ID)) !== null && _b !== void 0 ? _b : RINGER_FALLBACK_LENGTH;
        });
    }
    disconnect() {
        return __awaiter(this, void 0, void 0, function* () {
            this.stopBlink();
            const device = this.device;
            this.device = null;
            this.currentPhase = 'idle';
            if (device === null || device === void 0 ? void 0 : device.opened)
                yield device.close();
        });
    }
    stopBlink() {
        if (this.blinkHandle !== null) {
            clearInterval(this.blinkHandle);
            this.blinkHandle = null;
        }
    }
    sendColor(color) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            if (!((_a = this.device) === null || _a === void 0 ? void 0 : _a.opened))
                return;
            const { red = 0, green = 0, blue = 0 } = color !== null && color !== void 0 ? color : {};
            const on = color !== null;
            const report = buildReport([...LED_HEADER, red, green, blue, red, green, blue, on ? 0x01 : 0x00], this.ledReportLength);
            yield this.device.sendReport(REPORT_ID, report);
        });
    }
    /** Solid color for busy/held, blinking for ringing, off for idle. Best-effort. */
    setPhase(phase, colors = DEFAULT_BUSYLIGHT_COLORS) {
        return __awaiter(this, void 0, void 0, function* () {
            this.stopBlink();
            this.currentPhase = phase;
            if (phase === 'idle') {
                yield this.sendColor(null);
                return;
            }
            if (phase === 'ringing') {
                let lit = true;
                yield this.sendColor(colors.ringing);
                this.blinkHandle = setInterval(() => {
                    lit = !lit;
                    void this.sendColor(lit ? colors.ringing : null);
                }, BUSYLIGHT_BLINK_INTERVAL_MS);
                return;
            }
            yield this.sendColor(phase === 'held' ? colors.held : colors.busy);
        });
    }
    get phase() {
        return this.currentPhase;
    }
    ring() {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            if (!((_a = this.device) === null || _a === void 0 ? void 0 : _a.opened))
                return;
            yield this.device.sendReport(REPORT_ID, buildReport(RINGER_VOLUME_HEADER, this.ringerReportLength));
            yield this.device.sendReport(REPORT_ID, buildReport(RINGER_TRIGGER_HEADER, this.ringerReportLength));
        });
    }
}
//# sourceMappingURL=epos-busylight.js.map