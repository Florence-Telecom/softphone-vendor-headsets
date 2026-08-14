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
import { isCefHosted } from '../../../utils';
import { webhidConsent, DeviceSignalType, findDevice } from '@vbet/webhid-sdk';
export default class VBetService extends VendorImplementation {
    constructor() {
        super(...arguments);
        this._deviceInfo = null;
        this.activeDevice = null;
        this.vendorName = 'VBet';
        this.processBtnPress = (signal) => {
            switch (signal) {
                case DeviceSignalType.ACCEPT_CALL:
                    if (this.pendingConversationId) {
                        this.answerCall(this.pendingConversationId);
                        this.deviceAnsweredCall({
                            name: 'OffHook',
                            conversationId: this.activeConversationId,
                        });
                    }
                    else {
                        this.logger.error('No call to be answered');
                    }
                    break;
                case DeviceSignalType.END_CALL:
                    if (this.activeConversationId) {
                        const id = this.activeConversationId;
                        this.endCall(id);
                        this.deviceEndedCall({
                            name: 'OnHook',
                            conversationId: id,
                        });
                    }
                    else {
                        this.logger.error('No call to be terminated');
                    }
                    break;
                case DeviceSignalType.MUTE_CALL:
                case DeviceSignalType.UNMUTE_CALL:
                    if (this.activeConversationId) {
                        this.setMute(signal === DeviceSignalType.MUTE_CALL);
                        this.deviceMuteChanged({
                            isMuted: this.isMuted,
                            name: this.isMuted ? 'CallMuted' : 'CallUnmuted',
                            conversationId: this.activeConversationId,
                        });
                    }
                    else {
                        this.logger.error('No call to be muted');
                    }
                    break;
                case DeviceSignalType.REJECT_CALL:
                    if (this.pendingConversationId) {
                        this.rejectCall(this.pendingConversationId);
                        this.deviceRejectedCall({
                            name: 'Reject',
                            conversationId: this.pendingConversationId,
                        });
                    }
                    else {
                        this.logger.error('No call to be rejected');
                    }
                    break;
            }
        };
    }
    static getInstance(config) {
        if (!VBetService.instance) {
            VBetService.instance = new VBetService(config);
        }
        return VBetService.instance;
    }
    get deviceInfo() {
        return this._deviceInfo;
    }
    isSupported() {
        return window.navigator.hid && !isCefHosted();
    }
    deviceLabelMatchesVendor(label) {
        const lowerLabel = label.toLowerCase();
        return ['vt', '340b'].some((searchVal) => lowerLabel.includes(searchVal));
    }
    connect(originalDeviceLabel = '', options) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.isConnecting) {
                this.changeConnectionStatus({ isConnected: this.isConnected, isConnecting: true });
            }
            try {
                const dev = (options === null || options === void 0 ? void 0 : options.manualProviderSelection) ? null : yield findDevice(originalDeviceLabel);
                if (dev) {
                    this.activeDevice = dev;
                }
                else {
                    const dev = yield new Promise((resolve, reject) => {
                        const productId = this.deductProductId(originalDeviceLabel);
                        const waiter = setTimeout(() => reject('The selected device was not granted WebHID permissions'), 30000);
                        this.requestWebHidPermissions(() => {
                            webhidConsent({
                                productId: productId ? productId : undefined,
                            })
                                .then((res) => {
                                resolve(res);
                                clearTimeout(waiter);
                            })
                                .catch((err) => {
                                reject(err);
                            });
                        });
                    });
                    this.activeDevice = dev;
                }
            }
            catch (error) {
                this.isConnecting &&
                    this.changeConnectionStatus({ isConnected: this.isConnected, isConnecting: false });
                this.logger.error(error);
                return;
            }
            this._deviceInfo = {
                ProductName: this.activeDevice.productName,
            };
            this.activeDevice.subscribe(this.processBtnPress);
            this.changeConnectionStatus({ isConnected: true, isConnecting: false });
        });
    }
    disconnect() {
        return __awaiter(this, void 0, void 0, function* () {
            this.changeConnectionStatus({ isConnected: false, isConnecting: false });
            this.activeDevice && this.activeDevice.unsubscribe();
            this.activeDevice = null;
            this._deviceInfo = null;
            this.isMuted = false;
        });
    }
    incomingCall(callInfo) {
        return __awaiter(this, void 0, void 0, function* () {
            this.pendingConversationId = callInfo.conversationId;
            this.activeDevice.ring();
        });
    }
    outgoingCall(callInfo) {
        return __awaiter(this, void 0, void 0, function* () {
            this.activeConversationId = callInfo.conversationId;
            this.activeDevice.offHook();
        });
    }
    answerCall(conversationId, autoAnswer) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.pendingConversationId === conversationId || autoAnswer) {
                this.activeConversationId = conversationId;
                this.pendingConversationId = '';
                this.activeDevice.offHook();
            }
            else {
                this.logger.error('no call to be answered');
            }
        });
    }
    rejectCall(conversationId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (conversationId === this.pendingConversationId) {
                this.pendingConversationId = '';
                this.activeDevice.onHook();
            }
            else {
                this.logger.error('no call to be rejected');
            }
        });
    }
    endCall(conversationId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (conversationId === this.activeConversationId) {
                this.activeConversationId = '';
                this.pendingConversationId = '';
                this.activeDevice.onHook();
            }
            else {
                this.logger.error('no call to be ended');
            }
        });
    }
    endAllCalls() {
        return __awaiter(this, void 0, void 0, function* () {
            this.activeConversationId = '';
            this.pendingConversationId = '';
            this.activeDevice.onHook();
        });
    }
    setMute(value) {
        return __awaiter(this, void 0, void 0, function* () {
            this.isMuted = value;
            this.isMuted ? this.activeDevice.muteOn() : this.activeDevice.muteOff();
        });
    }
}
//# sourceMappingURL=vbet.js.map