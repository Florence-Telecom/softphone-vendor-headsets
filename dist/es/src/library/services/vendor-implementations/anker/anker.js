var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { VendorImplementation } from '../vendor-implementation';
import { checkWebHidSupport } from '../../../utils';
/*
 * Anker PowerConf speakerphones (tested with the PowerConf S330, 291a:3308).
 *
 * The device exposes a standard HID Telephony collection (usage page 0x0B, usage 0x01 "Phone"):
 *   Input  report 2: bit0 Hook Switch, bit1 Flash, bit2 Hold, bit3 Phone Mute
 *   Output report 3: bit0 Ring LED
 *   Output report 4: bit0 Mute LED
 *   Output report 5: bit0 Hold LED
 *   Output report 6: 12 LED bits + 7 padding bits (3 bytes); bit1 is Off-Hook
 *
 * Unlike most telephony headsets, the call button is stateless: every press sends the same
 * report (Hook Switch + Flash = 0x03) with no release report, regardless of the Off-Hook LED.
 * The call state is therefore tracked here and a press is interpreted from it:
 * ringing -> answer, call in progress -> hang up, idle -> ignored.
 */
export const ANKER_VENDOR_ID = 0x291A;
const TELEPHONY_USAGE_PAGE = 0x000B;
const PHONE_USAGE = 0x0001;
const HEADSET_USAGE = 0x0005;
const BUTTON_INPUT_REPORT_ID = 0x02;
const HOOK_SWITCH_BIT = 0x01;
const PHONE_MUTE_BIT = 0x08;
const RING_LED_REPORT_ID = 0x03;
const MUTE_LED_REPORT_ID = 0x04;
const HOLD_LED_REPORT_ID = 0x05;
const MULTI_LED_REPORT_ID = 0x06;
const OFF_HOOK_LED_BIT = 0x02;
export default class AnkerService extends VendorImplementation {
    constructor() {
        super(...arguments);
        this.vendorName = 'Anker';
        this.activeDevice = null;
        this._deviceInfo = null;
        this.callState = 'idle';
        this.activeConversationId = null;
        this.pendingConversationId = null;
        this.isHeld = false;
        this.handleInputReport = (event) => {
            if (event.reportId !== BUTTON_INPUT_REPORT_ID) {
                return;
            }
            const bits = event.data.getUint8(0);
            this.logger.debug(`Anker: received input report 0x${bits.toString(16).padStart(2, '0')}`, { callState: this.callState });
            if (bits & HOOK_SWITCH_BIT) {
                this.handleCallButtonPress();
            }
            if (bits & PHONE_MUTE_BIT) {
                this.handleMuteButtonPress();
            }
        };
    }
    static getInstance(config) {
        if (!AnkerService.instance || config.createNew) {
            AnkerService.instance = new AnkerService(config);
        }
        return AnkerService.instance;
    }
    get deviceInfo() {
        return this._deviceInfo;
    }
    get isDeviceAttached() {
        return !!this.activeDevice;
    }
    get _callState() {
        return this.callState;
    }
    isSupported() {
        return !!checkWebHidSupport(this.config, this.vendorName.toLowerCase());
    }
    deviceLabelMatchesVendor(label) {
        const lowerLabel = label.toLowerCase();
        return ['powerconf', '(291a:'].some(searchVal => lowerLabel.includes(searchVal));
    }
    connect(originalDeviceLabel) {
        return __awaiter(this, void 0, void 0, function* () {
            this.logger.debug('Anker: connect attempt', { originalDeviceLabel });
            if (!this.isConnecting) {
                this.changeConnectionStatus({ isConnected: this.isConnected, isConnecting: true });
            }
            try {
                // A device granted earlier does not need the permission prompt again
                const grantedDevices = yield window.navigator.hid.getDevices();
                let device = this.selectDevice(grantedDevices, originalDeviceLabel);
                if (!device) {
                    device = yield new Promise((resolve, reject) => {
                        const waiter = setTimeout(() => reject(new Error('The selected device was not granted WebHID permissions')), 30000);
                        this.requestWebHidPermissions(() => __awaiter(this, void 0, void 0, function* () {
                            try {
                                const productId = this.deductProductId(originalDeviceLabel);
                                const devices = yield window.navigator.hid.requestDevice({
                                    filters: [{ vendorId: ANKER_VENDOR_ID, productId: productId || undefined, usagePage: TELEPHONY_USAGE_PAGE }]
                                });
                                clearTimeout(waiter);
                                const selected = this.selectDevice(devices, originalDeviceLabel);
                                selected ? resolve(selected) : reject(new Error('No Anker telephony device was selected'));
                            }
                            catch (err) {
                                clearTimeout(waiter);
                                reject(err);
                            }
                        }));
                    });
                }
                if (!device.opened) {
                    yield device.open();
                }
                this.activeDevice = device;
                this.activeDevice.addEventListener('inputreport', this.handleInputReport);
                this._deviceInfo = { ProductName: device.productName };
                this.resetState();
                yield this.syncLeds();
                this.logger.debug('Anker: connected', { productName: device.productName });
                this.changeConnectionStatus({ isConnected: true, isConnecting: false });
            }
            catch (error) {
                this.logger.error('Anker: failed to connect', error);
                this.activeDevice = null;
                this.isConnecting && this.changeConnectionStatus({ isConnected: this.isConnected, isConnecting: false });
            }
        });
    }
    /**
     * Picks the Anker device exposing the telephony collection. When several are granted,
     * prefer the one whose product name appears in the selected microphone label.
     */
    selectDevice(devices, originalDeviceLabel = '') {
        const label = originalDeviceLabel.toLowerCase();
        const candidates = (devices || []).filter(device => {
            var _a;
            return device.vendorId === ANKER_VENDOR_ID &&
                ((_a = device.collections) === null || _a === void 0 ? void 0 : _a.some(c => c.usagePage === TELEPHONY_USAGE_PAGE && (c.usage === PHONE_USAGE || c.usage === HEADSET_USAGE)));
        });
        return candidates.find(device => device.productName && label.includes(device.productName.toLowerCase())) || candidates[0] || null;
    }
    disconnect() {
        return __awaiter(this, void 0, void 0, function* () {
            this.logger.debug('Anker: disconnect');
            if (this.activeDevice) {
                this.resetState();
                yield this.syncLeds();
                this.activeDevice.removeEventListener('inputreport', this.handleInputReport);
                yield this.activeDevice.close();
            }
            this.activeDevice = null;
            this._deviceInfo = null;
            if (this.isConnected || this.isConnecting) {
                this.changeConnectionStatus({ isConnected: false, isConnecting: false });
            }
        });
    }
    handleCallButtonPress() {
        switch (this.callState) {
            case 'ringing': {
                const conversationId = this.pendingConversationId;
                this.markCallActive(conversationId);
                this.syncLeds();
                this.deviceAnsweredCall({ name: 'CallOffHook', conversationId });
                break;
            }
            case 'active': {
                const conversationId = this.activeConversationId;
                this.resetState();
                this.syncLeds();
                this.deviceEndedCall({ name: 'CallOnHook', conversationId });
                break;
            }
            default:
                this.logger.debug('Anker: call button pressed with no call to answer or end');
        }
    }
    handleMuteButtonPress() {
        if (this.callState !== 'active') {
            this.logger.debug('Anker: mute button pressed with no active call');
            return;
        }
        this.isMuted = !this.isMuted;
        this.sendLed(MUTE_LED_REPORT_ID, [this.isMuted ? 1 : 0]);
        this.deviceMuteChanged({
            isMuted: this.isMuted,
            name: this.isMuted ? 'CallMuted' : 'CallUnmuted',
            conversationId: this.activeConversationId
        });
    }
    incomingCall(callInfo) {
        return __awaiter(this, void 0, void 0, function* () {
            this.pendingConversationId = callInfo.conversationId;
            if (this.callState === 'idle') {
                this.callState = 'ringing';
            }
            yield this.syncLeds();
        });
    }
    outgoingCall(callInfo) {
        return __awaiter(this, void 0, void 0, function* () {
            this.markCallActive(callInfo.conversationId);
            yield this.syncLeds();
        });
    }
    answerCall(conversationId) {
        return __awaiter(this, void 0, void 0, function* () {
            this.markCallActive(conversationId);
            yield this.syncLeds();
        });
    }
    rejectCall(conversationId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (conversationId && conversationId !== this.pendingConversationId) {
                this.logger.debug('Anker: reject ignored for unknown conversation', { conversationId });
                return;
            }
            this.pendingConversationId = null;
            if (this.callState === 'ringing') {
                this.callState = 'idle';
            }
            yield this.syncLeds();
        });
    }
    endCall(conversationId, hasOtherActiveCalls) {
        return __awaiter(this, void 0, void 0, function* () {
            if (conversationId && conversationId !== this.activeConversationId) {
                this.logger.debug('Anker: end ignored for unknown conversation', { conversationId });
                return;
            }
            if (hasOtherActiveCalls) {
                this.activeConversationId = null;
                return;
            }
            this.resetState();
            yield this.syncLeds();
        });
    }
    endAllCalls() {
        return __awaiter(this, void 0, void 0, function* () {
            this.resetState();
            yield this.syncLeds();
        });
    }
    setMute(value) {
        return __awaiter(this, void 0, void 0, function* () {
            this.isMuted = value;
            yield this.sendLed(MUTE_LED_REPORT_ID, [value ? 1 : 0]);
        });
    }
    setHold(conversationId, value) {
        return __awaiter(this, void 0, void 0, function* () {
            this.isHeld = value;
            yield this.sendLed(HOLD_LED_REPORT_ID, [value ? 1 : 0]);
        });
    }
    markCallActive(conversationId) {
        this.activeConversationId = conversationId;
        if (this.pendingConversationId === conversationId) {
            this.pendingConversationId = null;
        }
        this.callState = 'active';
    }
    resetState() {
        this.callState = 'idle';
        this.activeConversationId = null;
        this.pendingConversationId = null;
        this.isMuted = false;
        this.isHeld = false;
    }
    syncLeds() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.sendLed(RING_LED_REPORT_ID, [this.callState === 'ringing' ? 1 : 0]);
            yield this.sendLed(MULTI_LED_REPORT_ID, [this.callState === 'active' ? OFF_HOOK_LED_BIT : 0, 0, 0]);
            yield this.sendLed(MUTE_LED_REPORT_ID, [this.isMuted ? 1 : 0]);
            yield this.sendLed(HOLD_LED_REPORT_ID, [this.isHeld ? 1 : 0]);
        });
    }
    sendLed(reportId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.activeDevice) {
                return;
            }
            try {
                yield this.activeDevice.sendReport(reportId, new Uint8Array(data));
            }
            catch (error) {
                this.logger.warn(`Anker: failed to send output report ${reportId}`, error);
            }
        });
    }
}
//# sourceMappingURL=anker.js.map