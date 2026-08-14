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
const vendor_implementation_1 = require("../vendor-implementation");
const jabra_js_1 = require("@gnaudio/jabra-js");
const rxjs_1 = require("rxjs");
const operators_1 = require("rxjs/operators");
const utils_1 = require("../../../utils");
class JabraService extends vendor_implementation_1.VendorImplementation {
    constructor(config) {
        super(config);
        this.isActive = false;
        this.isMuted = false;
        this.isHeld = false;
        this.version = null;
        this.ongoingCalls = 0;
        this.callLock = false;
        this.vendorName = 'Jabra';
    }
    isSupported() {
        return window.navigator.hid && !(0, utils_1.isCefHosted)();
    }
    deviceLabelMatchesVendor(label) {
        const lowerLabel = label.toLowerCase();
        if (['jabra'].some((searchVal) => lowerLabel.includes(searchVal))) {
            return true;
        }
        return false;
    }
    static getInstance(config) {
        if (!JabraService.instance || config.createNew) {
            JabraService.instance = new JabraService(config);
        }
        return JabraService.instance;
    }
    get deviceInfo() {
        return this._deviceInfo;
    }
    get deviceName() {
        var _a;
        return (_a = this.deviceInfo) === null || _a === void 0 ? void 0 : _a.deviceName;
    }
    get isDeviceAttached() {
        return !!this.deviceInfo;
    }
    resetState() {
        this.setHold(null, false);
        this.setMute(false);
    }
    _processEvents(callControl) {
        this.headsetEventSubscription = callControl.deviceSignals.subscribe((signal) => __awaiter(this, void 0, void 0, function* () {
            if (!this.callLock) {
                this.logger.debug('Currently not in possession of the Call Lock; Cannot react to Device Actions');
                return;
            }
            switch (signal.type) {
                case jabra_js_1.SignalType.HOOK_SWITCH:
                    // do nothing when the end call button is pressed and we have an incoming call while we have an active call
                    if (this.activeConversationId && this.pendingConversationId) {
                        this.logger.info('ignoring hookswitch event because there is an active and incoming call');
                        break;
                    }
                    if (signal.value) {
                        callControl.offHook(true);
                        callControl.ring(false);
                        this.activeConversationId = this.pendingConversationId;
                        this.pendingConversationId = null;
                        if (!this.pendingConversationIsOutbound) {
                            this.deviceAnsweredCall({
                                name: 'CallOffHook',
                                code: signal.type,
                                conversationId: this.activeConversationId,
                            });
                        }
                    }
                    else {
                        callControl.mute(false);
                        callControl.hold(false);
                        callControl.offHook(false);
                        this.deviceEndedCall({
                            name: 'CallOnHook',
                            code: signal.type,
                            conversationId: this.activeConversationId,
                        });
                        try {
                            callControl.releaseCallLock();
                        }
                        catch ({ message, type }) {
                            if (this.checkForCallLockError(message, type)) {
                                this.logger.info(message);
                            }
                            else {
                                this.logger.error(type, message);
                            }
                        }
                        finally {
                            this.activeConversationId = null;
                            this.callLock = false;
                        }
                    }
                    break;
                case jabra_js_1.SignalType.FLASH:
                case jabra_js_1.SignalType.ALT_HOLD:
                    this.isHeld = !this.isHeld;
                    callControl.hold(this.isHeld);
                    this.deviceHoldStatusChanged({
                        holdRequested: this.isHeld,
                        name: this.isHeld ? 'OnHold' : 'ResumeCall',
                        code: signal.type,
                        conversationId: this.activeConversationId,
                    });
                    break;
                case jabra_js_1.SignalType.PHONE_MUTE:
                    this.isMuted = !this.isMuted;
                    callControl.mute(this.isMuted);
                    this.deviceMuteChanged({
                        isMuted: this.isMuted,
                        name: this.isMuted ? 'CallMuted' : 'CallUnmuted',
                        code: signal.type,
                        conversationId: this.activeConversationId,
                    });
                    break;
                case jabra_js_1.SignalType.REJECT_CALL:
                    callControl.ring(false);
                    this.deviceRejectedCall({
                        name: jabra_js_1.SignalType[signal.type],
                        conversationId: this.pendingConversationId,
                    });
                    this.pendingConversationId = null;
                    try {
                        // we only want to release call controls if there isn't another call active
                        if (!this.activeConversationId) {
                            callControl.releaseCallLock();
                            this.callLock = false;
                        }
                    }
                    catch ({ message, type }) {
                        if (this.checkForCallLockError(message, type)) {
                            this.logger.info(message);
                        }
                        else {
                            this.logger.error(type, message);
                        }
                    }
            }
        }));
    }
    setMute(value) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.callLock) {
                return;
            }
            this.isMuted = value;
            this.callControl.mute(value);
        });
    }
    setHold(conversationId, value) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.callLock) {
                return;
            }
            this.isHeld = value;
            this.callControl.hold(value);
        });
    }
    incomingCall(callInfo) {
        return __awaiter(this, void 0, void 0, function* () {
            this.pendingConversationId = callInfo.conversationId;
            this.pendingConversationIsOutbound = false;
            try {
                this.callLock = yield this.callControl.takeCallLock();
            }
            catch ({ message, type }) {
                if (this.checkForCallLockError(message, type)) {
                    this.logger.info(message);
                    this.callLock = true;
                }
                else {
                    this.logger.error(type, message);
                }
            }
            if (this.callLock) {
                this.callControl.ring(true);
            }
        });
    }
    answerCall(conversationId, autoAnswer) {
        return __awaiter(this, void 0, void 0, function* () {
            if (autoAnswer) {
                this.pendingConversationId = conversationId;
                try {
                    this.callLock = yield this.callControl.takeCallLock();
                }
                catch ({ message, type }) {
                    if (this.checkForCallLockError(message, type)) {
                        this.logger.info(message);
                        this.callLock = true;
                    }
                    else {
                        this.logger.error(type, message);
                    }
                }
            }
            if (!this.callLock) {
                return;
            }
            this.callControl.ring(false);
            this.callControl.offHook(true);
        });
    }
    rejectCall() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.callLock) {
                return this.logger.info('Currently not in possession of the Call Lock; Cannot react to Device Actions');
            }
            this.callControl.ring(false);
            this.pendingConversationId = null;
            if (!this.activeConversationId) {
                try {
                    this.resetState();
                    this.callControl.releaseCallLock();
                }
                catch ({ message, type }) {
                    if (this.checkForCallLockError(message, type)) {
                        this.logger.info(message);
                    }
                    else {
                        this.logger.error(type, message);
                    }
                }
                finally {
                    this.pendingConversationId = null;
                    this.callLock = false;
                }
            }
        });
    }
    outgoingCall(callInfo) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                this.callLock = yield this.callControl.takeCallLock();
            }
            catch ({ message, type }) {
                if (this.checkForCallLockError(message, type)) {
                    this.logger.info(message);
                    this.callLock = true;
                }
                else {
                    this.logger.error(type, message);
                }
            }
            if (this.callLock) {
                this.pendingConversationId = callInfo.conversationId;
                this.pendingConversationIsOutbound = true;
                this.callControl.offHook(true);
            }
        });
    }
    endCall(conversationId, hasOtherActiveCalls) {
        return __awaiter(this, void 0, void 0, function* () {
            if (hasOtherActiveCalls) {
                return;
            }
            if (conversationId === this.activeConversationId) {
                this.activeConversationId = null;
            }
            try {
                if (!this.callLock) {
                    return this.logger.info('Currently not in possession of the Call Lock; Cannot react to Device Actions');
                }
                this.callControl.offHook(false);
                this.resetState();
                this.callControl.releaseCallLock();
            }
            catch ({ message, type }) {
                if (this.checkForCallLockError(message, type)) {
                    this.logger.info(message);
                }
                else {
                    this.logger.error(type, message);
                }
            }
            finally {
                this.callLock = false;
            }
        });
    }
    endAllCalls() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!this.callLock) {
                    return this.logger.info('Currently not in possession of the Call Lock; Cannot react to Device Actions');
                }
                this.activeConversationId = null;
                this.callControl.offHook(false);
                this.resetState();
                this.callControl.releaseCallLock();
            }
            catch ({ message, type }) {
                if (this.checkForCallLockError(message, type)) {
                    this.logger.info(message);
                }
                else {
                    this.logger.error(type, message);
                }
            }
            finally {
                this.callLock = false;
            }
        });
    }
    isDeviceInList(device, deviceLabel) {
        var _a;
        return deviceLabel.toLowerCase().includes((_a = device === null || device === void 0 ? void 0 : device.name) === null || _a === void 0 ? void 0 : _a.toLowerCase());
    }
    connect(originalDeviceLabel) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.isConnecting) {
                return;
            }
            this.changeConnectionStatus({ isConnected: this.isConnected, isConnecting: true });
            if (!this.jabraSdk) {
                this.jabraSdk = yield this.initializeJabraSdk();
                this.callControlFactory = this.createCallControlFactory(this.jabraSdk);
            }
            const deviceLabel = originalDeviceLabel.toLocaleLowerCase();
            this._deviceInfo = null;
            let selectedDevice;
            if (yield this.deviceHasPermissions(deviceLabel)) {
                selectedDevice = yield this.getPreviouslyConnectedDevice(deviceLabel);
                if (!selectedDevice) {
                    console.warn('Unable to find appropriate device. Setting state to "Not Running" to allow a retry"', deviceLabel);
                    this.changeConnectionStatus({ isConnected: false, isConnecting: false });
                    return;
                }
            }
            else {
                try {
                    selectedDevice = yield this.getDeviceFromWebhid(deviceLabel);
                }
                catch (e) {
                    this.isConnecting &&
                        this.changeConnectionStatus({ isConnected: this.isConnected, isConnecting: false });
                    return;
                }
            }
            this.callControl = yield this.callControlFactory.createCallControl(selectedDevice);
            yield this.resetHeadsetState();
            this._processEvents(this.callControl);
            this._deviceInfo = {
                ProductName: selectedDevice.name,
                deviceName: selectedDevice.name,
                attached: true,
                deviceId: selectedDevice.id.toString(),
            };
            this.changeConnectionStatus({ isConnected: true, isConnecting: false });
        });
    }
    deviceHasPermissions(deviceLabel) {
        return __awaiter(this, void 0, void 0, function* () {
            const allowedHIDDevices = yield window.navigator.hid.getDevices();
            let deviceFound = false;
            allowedHIDDevices.forEach(device => {
                var _a;
                if (deviceLabel.includes((_a = device === null || device === void 0 ? void 0 : device.productName) === null || _a === void 0 ? void 0 : _a.toLowerCase())) {
                    deviceFound = true;
                }
            });
            return deviceFound;
        });
    }
    getPreviouslyConnectedDevice(deviceLabel) {
        return __awaiter(this, void 0, void 0, function* () {
            const waitForDevice = this.jabraSdk.deviceList.pipe((0, operators_1.defaultIfEmpty)(null), (0, operators_1.first)((devices) => !!devices.length), (0, operators_1.map)((devices) => devices.find((device) => this.isDeviceInList(device, deviceLabel))), (0, operators_1.filter)((device) => !!device), (0, operators_1.timeout)(15000));
            return (0, rxjs_1.firstValueFrom)(waitForDevice).catch((err) => {
                if (err instanceof rxjs_1.TimeoutError || err instanceof rxjs_1.EmptyError) {
                    return null;
                }
                return Promise.reject(err);
            });
        });
    }
    getDeviceFromWebhid(deviceLabel) {
        return __awaiter(this, void 0, void 0, function* () {
            this.requestWebHidPermissions(jabra_js_1.webHidPairing);
            return (0, rxjs_1.firstValueFrom)(this.jabraSdk.deviceList.pipe((0, operators_1.map)((devices) => devices.find((device) => this.isDeviceInList(device, deviceLabel))), (0, operators_1.filter)((device) => !!device), (0, operators_1.first)(), (0, operators_1.timeout)(30000))).catch((err) => {
                if (err instanceof rxjs_1.TimeoutError) {
                    err = new Error('The selected device was not granted WebHID permissions');
                }
                this.logger.error(err);
                return Promise.reject(err);
            });
        });
    }
    /* istanbul ignore next */
    initializeJabraSdk() {
        return __awaiter(this, void 0, void 0, function* () {
            return (0, jabra_js_1.init)({
                appId: 'softphone-vendor-headsets',
                appName: 'Softphone Headset Library',
                transport: jabra_js_1.RequestedBrowserTransport.CHROME_EXTENSION_WITH_WEB_HID_FALLBACK,
            });
        });
    }
    /* istanbul ignore next */
    createCallControlFactory(sdk) {
        return new jabra_js_1.CallControlFactory(sdk);
    }
    checkForCallLockError(message, type) {
        return (type === jabra_js_1.ErrorType.SDK_USAGE_ERROR && message.includes('call lock'));
    }
    resetHeadsetState() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.callControl) {
                return;
            }
            try {
                yield this.callControl.takeCallLock();
                this.callControl.hold(false);
                this.callControl.mute(false);
                this.callControl.offHook(false);
                this.callControl.releaseCallLock();
            }
            catch (e) {
                this.logger.warn('Failed to takeCallLock in order to resetHeadsetState. Ignoring reset.');
            }
        });
    }
    disconnect() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!this.callLock) {
                    return this.logger.info('Currently not in possession of the Call Lock; Cannot react to Device Actions');
                }
                this.callControl.releaseCallLock();
            }
            catch ({ message, type }) {
                if (this.checkForCallLockError(message, type)) {
                    this.logger.info(message);
                }
                else {
                    this.logger.error(type, message);
                }
            }
            finally {
                this.resetHeadsetState();
                this.callLock = false;
                if (this.activeConversationId) {
                    this.activeConversationId = null;
                }
                this.headsetEventSubscription && this.headsetEventSubscription.unsubscribe();
                (this.isConnected || this.isConnecting) &&
                    this.changeConnectionStatus({ isConnected: false, isConnecting: false });
            }
        });
    }
}
exports.default = JabraService;
JabraService.connectTimeout = 5000;
//# sourceMappingURL=jabra.js.map