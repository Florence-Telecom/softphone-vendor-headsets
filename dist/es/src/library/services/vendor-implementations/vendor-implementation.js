import { EventEmitter } from 'events';
export class VendorImplementation extends EventEmitter {
    constructor(config) {
        super();
        // TODO: rename this to something more descriptive
        this.vendorName = 'Not Specified';
        this.isConnecting = false; // trying to connect with the headset controlling software, ex: plantronics hub
        this.isConnected = false; // represents a connection to the headset controlling software, ex: plantronics hub
        this.isMuted = false;
        this.errorCode = null;
        this.disableRetry = false;
        const eventEmitter = new EventEmitter();
        Object.keys(eventEmitter.__proto__).forEach((name) => {
            this[name] = eventEmitter[name];
        });
        this.config = config;
        this.vendorName = config.vendorName;
        this.logger = config.logger;
    }
    get isDeviceAttached() {
        throw new Error(`${this.vendorName} - isDeviceAttatched getter not implemented`);
    }
    isSupported() {
        return true;
    }
    /* eslint-disable @typescript-eslint/no-unused-vars */
    deviceLabelMatchesVendor(label) {
        throw new Error(`${this.vendorName} - deviceLabelMatchesVendor() not implemented`);
    }
    connect(selectedMicLabel, options) {
        return Promise.reject(new Error(`${this.vendorName} - connect() not implemented`));
    }
    disconnect(clearReason) {
        return Promise.reject(new Error(`${this.vendorName} - disconnect() not implemented`));
    }
    incomingCall(callInfo, hasOtherActiveCalls) {
        // TODO: propagate this changed parameter (used to be callInfo, but there are several differents signatures in the implementing classes)
        return Promise.reject(new Error(`${this.vendorName} - incomingCall() not implemented`));
    }
    outgoingCall(callInfo) {
        return Promise.reject(new Error(`${this.vendorName} - outgoingCall() not implemented`));
    }
    answerCall(conversationId, autoAnswer) {
        return Promise.reject(new Error(`${this.vendorName} - answerCall() not implemented`));
    }
    rejectCall(conversationId) {
        return Promise.reject(new Error(`${this.vendorName} - rejectCall() not implemented`));
    }
    endCall(conversationId, hasOtherActiveCalls) {
        return Promise.reject(new Error(`${this.vendorName} - endCall() not implemented`));
    }
    endAllCalls() {
        return Promise.reject(new Error(`${this.vendorName} - endAllCalls() not implemented`));
    }
    setMute(value) {
        return Promise.reject(new Error(`${this.vendorName} - setMute() not implemented`));
    }
    setHold(conversationId, value) {
        return Promise.reject(new Error(`${this.vendorName} - setHold() not implemented`));
    }
    resetHeadsetStateForCall(conversationId) {
        return this.rejectCall(conversationId);
    }
    /* eslint-enable */
    emitEvent(eventName, eventBody) {
        this.emit(eventName, { vendor: this, body: Object.assign({}, eventBody) });
    }
    /* eslint-disable @typescript-eslint/explicit-module-boundary-types */
    requestWebHidPermissions(callback) {
        /* eslint-enable */
        this.logger.debug('Emitting premission request event');
        this.emitEvent('webHidPermissionRequested', { callback });
    }
    deviceAnsweredCall(eventInfo) {
        this.emitEvent('deviceAnsweredCall', eventInfo);
    }
    deviceRejectedCall(eventInfo) {
        this.emitEvent('deviceRejectedCall', eventInfo);
    }
    deviceEndedCall(eventInfo) {
        this.emitEvent('deviceEndedCall', eventInfo);
    }
    deviceMuteChanged(eventInfo) {
        this.emitEvent('deviceMuteStatusChanged', Object.assign({}, eventInfo));
    }
    deviceHoldStatusChanged(eventInfo) {
        this.emitEvent('deviceHoldStatusChanged', Object.assign({}, eventInfo));
    }
    deviceEventLogs(eventInfo) {
        this.emitEvent('deviceEventLogs', eventInfo);
    }
    changeConnectionStatus(headsetState) {
        this.isConnected = headsetState.isConnected;
        this.isConnecting = headsetState.isConnecting;
        this.emitEvent('deviceConnectionStatusChanged', Object.assign({ currentVendor: this }, headsetState));
    }
    /**
     * Try to deduct the product id based on the label.
     * Making the assumption that the label will end with (vendorid:productid).
     *
     * @param selectedMicLabel
     * @returns The product id if matched or null.
     */
    deductProductId(selectedMicLabel) {
        const match = selectedMicLabel === null || selectedMicLabel === void 0 ? void 0 : selectedMicLabel.match(/\((\w+):(\w+)\)$/);
        return match ? parseInt(match[2], 16) : null;
    }
}
//# sourceMappingURL=vendor-implementation.js.map