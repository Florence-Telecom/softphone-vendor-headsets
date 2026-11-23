"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("../../../../utils");
const vendor_implementation_1 = require("../../vendor-implementation");
const types_1 = require("./types");
const connectTimeout = 5000;
const offHookThrottleTime = 500;
class JabraNativeService extends vendor_implementation_1.VendorImplementation {
    constructor(config) {
        var _a;
        super(config);
        this.isActive = false;
        this.devices = null;
        this.activeDeviceId = null;
        this.headsetState = null;
        this.ignoreNextOffhookEvent = false;
        this.cefSupportsJabra = true;
        this.config = config;
        this.vendorName = 'Jabra';
        this.headsetState = { ringing: false, offHook: false };
        this.devices = new Map();
        if ((0, utils_1.isCefHosted)() && ((_a = this.config.hostedContext) === null || _a === void 0 ? void 0 : _a.isHosted())) {
            this.setupNativeHandlers();
        }
    }
    setupNativeHandlers() {
        const hostedContext = this.config.hostedContext;
        this.cefSupportsJabra = hostedContext.supportsJabra();
        hostedContext.on('JabraEvent', this.handleJabraEvent.bind(this));
        hostedContext.on('JabraDeviceAttached', this.handleJabraDeviceAttached.bind(this));
    }
    static getInstance(config) {
        if (!JabraNativeService.instance || config.createNew) {
            JabraNativeService.instance = new JabraNativeService(config);
        }
        return JabraNativeService.instance;
    }
    get deviceInfo() {
        if (this.activeDeviceId === null ||
            this.devices === null ||
            (this.devices && !this.devices.size)) {
            return null;
        }
        return this.devices.get(this.activeDeviceId);
    }
    get deviceName() {
        return this.deviceInfo && this.deviceInfo.deviceName;
    }
    get isDeviceAttached() {
        return !!this.deviceInfo;
    }
    isHeadsetEvent(event) {
        return event.msg === types_1.HeadsetEvent;
    }
    isDeviceEvent(event) {
        return event.msg === types_1.DeviceEvent;
    }
    handleCefEvent(event) {
        if (!this.isConnected) {
            return;
        }
        if (this.isDeviceEvent(event)) {
            this.handleJabraDeviceAttached(event);
        }
        else if (this.isHeadsetEvent(event)) {
            this.handleJabraEvent(event);
        }
    }
    handleJabraDeviceAttached(event) {
        this.logger.debug('handling jabra attach/detach event', event);
        this.updateDevices();
    }
    handleJabraEvent(event) {
        this.logger.debug(`Jabra event received`, event);
        this._processEvent(event.eventName, event.value);
    }
    _handleOffhookEvent(isOffhook) {
        // if is incoming
        if (isOffhook) {
            this.activeConversationId = this.pendingConversationId;
            this.pendingConversationId = null;
            if (this.headsetState.ringing) {
                if (!this.pendingConversationIsOutbound) {
                    this.deviceAnsweredCall({ name: 'CallOffHook', conversationId: this.activeConversationId });
                }
                // jabra requires you to echo the event back in acknowledgement
                this._sendCmd(types_1.JabraNativeCommands.Offhook, isOffhook);
                this._setRinging(false);
            }
            return;
        }
        if (this.activeConversationId) {
            this._sendCmd(types_1.JabraNativeCommands.Offhook, isOffhook);
            this.deviceEndedCall({ name: 'CallOnHook', conversationId: this.activeConversationId });
        }
        this._getHeadsetIntoVanillaState();
        this.activeConversationId = null;
    }
    _handleMuteEvent(isMuted) {
        // jabra requires you to echo the event back in acknowledgement
        this._sendCmd(types_1.JabraNativeCommands.Mute, isMuted);
        this.isMuted = isMuted;
        this.deviceMuteChanged({
            isMuted: isMuted,
            name: isMuted ? 'CallMuted' : 'CallUnmuted',
            conversationId: this.activeConversationId
        });
    }
    _handleHoldEvent(isHeld) {
        // jabra requires you to echo the event back in acknowledgement
        this._sendCmd(types_1.JabraNativeCommands.Hold, !!isHeld);
        this.deviceHoldStatusChanged({
            holdRequested: !!isHeld,
            name: !!isHeld ? 'OnHold' : 'ResumeCall',
            conversationId: this.activeConversationId
        });
    }
    _getHeadsetIntoVanillaState() {
        this.setHold(null, false);
        this.setMute(false);
    }
    _sendCmd(cmd, value) {
        const deviceID = this.activeDeviceId;
        this.logger.debug('Sending command to headset', { deviceID, cmd, value });
        this.config.hostedContext.sendEventToDesktop('jabraEvent', {
            deviceID,
            event: cmd,
            value
        });
    }
    _setRinging(value) {
        this._sendCmd(types_1.JabraNativeCommands.Ring, value);
        this.headsetState.ringing = value;
    }
    isSupported() {
        return (0, utils_1.isCefHosted)() && this.cefSupportsJabra && !this.config.useWebHidOnDesktopJabra;
    }
    deviceLabelMatchesVendor(label) {
        const lowerLabel = label.toLowerCase();
        return ['jabra'].some(searchVal => lowerLabel.includes(searchVal));
    }
    setMute(value) {
        return __awaiter(this, void 0, void 0, function* () {
            this._sendCmd(types_1.JabraNativeCommands.Mute, value);
        });
    }
    setHold(conversationId, value) {
        return __awaiter(this, void 0, void 0, function* () {
            this._sendCmd(types_1.JabraNativeCommands.Hold, value);
        });
    }
    incomingCall(callInfo) {
        return __awaiter(this, void 0, void 0, function* () {
            this.pendingConversationId = callInfo.conversationId;
            this.pendingConversationIsOutbound = false;
            this._setRinging(true);
        });
    }
    answerCall(conversationId, autoAnswer) {
        return __awaiter(this, void 0, void 0, function* () {
            if (autoAnswer) {
                this.pendingConversationId = conversationId;
            }
            // HACK: for some reason the headset echos an offhook event even though it was the app that answered the call rather than the headset
            this.ignoreNextOffhookEvent = true;
            this._sendCmd(types_1.JabraNativeCommands.Offhook, true);
        });
    }
    rejectCall() {
        return __awaiter(this, void 0, void 0, function* () {
            this._setRinging(false);
            this.pendingConversationId = null;
        });
    }
    outgoingCall(callInfo) {
        return __awaiter(this, void 0, void 0, function* () {
            this.pendingConversationId = callInfo.conversationId;
            this.pendingConversationIsOutbound = true;
            this._sendCmd(types_1.JabraNativeCommands.Offhook, true);
        });
    }
    endCall(conversationId, hasOtherActiveCalls) {
        return __awaiter(this, void 0, void 0, function* () {
            this._setRinging(false);
            if (!hasOtherActiveCalls) {
                this._sendCmd(types_1.JabraNativeCommands.Offhook, false);
            }
            this.activeConversationId = null;
        });
    }
    endAllCalls() {
        return __awaiter(this, void 0, void 0, function* () {
            this._setRinging(false);
            this._sendCmd(types_1.JabraNativeCommands.Offhook, false);
            this.activeConversationId = null;
        });
    }
    updateDevices() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const data = (yield (0, utils_1.requestCefPromise)({ cmd: 'requestJabraDevices' }));
                this.changeConnectionStatus({ isConnected: true, isConnecting: false });
                if (!data || !data.length) {
                    this.devices.clear();
                    this.activeDeviceId = null;
                    this.logger.error(new Error('No attached jabra devices'));
                    return;
                }
                this.logger.info('connected jabra devices', data);
                this.devices.clear();
                data.forEach(device => this.devices.set(device.deviceID, device));
                this.activeDeviceId = data[0].deviceID;
                // reset headset state
                this._setRinging(false);
                this.setMute(false);
            }
            catch (err) {
                this.logger.error('Failed to connect to jabra', err);
                this.disconnect();
            }
        });
    }
    _processEvent(eventName, value) {
        switch (eventName) {
            case types_1.JabraNativeEventNames.OffHook:
                this.logger.debug(`Received hook switch event from device: ${value ? 'Off hook' : 'On hook'}`);
                (0, utils_1.debounce)(() => this._handleOffhookEvent(value), offHookThrottleTime)();
                break;
            case types_1.JabraNativeEventNames.RejectCall:
                this.logger.debug('Received reject call event from device');
                this.deviceRejectedCall({ name: types_1.JabraNativeEventNames.RejectCall, conversationId: this.pendingConversationId });
                break;
            case types_1.JabraNativeEventNames.Mute:
                this.logger.debug(`Received mute state toggle event from device: ${value ? 'Muting call' : 'Unmuting call'}`);
                this._handleMuteEvent(value);
                break;
            case types_1.JabraNativeEventNames.Hold:
                this.logger.debug(`Received hold state toggle event from device: ${value ? 'Holding call' : 'Resuming held call'}`);
                this._handleHoldEvent(value);
                break;
        }
    }
    connect() {
        this.logger.debug('Attempting to connect to Jabra Native implementation');
        this.changeConnectionStatus({ isConnected: false, isConnecting: true });
        return (0, utils_1.timedPromise)(this.updateDevices(), connectTimeout).catch(err => {
            this.logger.error('Failed to connect to Jabra', err);
        });
    }
    disconnect() {
        this.logger.debug('Attempting to disconnect to Jabra Native implementation');
        this.changeConnectionStatus({ isConnected: false, isConnecting: false });
        return Promise.resolve();
    }
}
exports.default = JabraNativeService;
//# sourceMappingURL=jabra-native.js.map