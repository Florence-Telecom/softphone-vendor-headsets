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
const utils_1 = require("../../../utils");
const offhookFlag = 0b1;
const muteFlag = 0b10;
const ringFlag = 0b100;
const holdFlag = 0b1000;
const recMuteFlag = 0b100;
const recReject = 0x40;
const HEADSET_USAGE = 0x0005;
const HEADSET_USAGE_PAGE = 0x000B;
const VENDOR_ID = 0x6993;
const HEADSET_REPORT_ID = 0x04;
class YealinkService extends vendor_implementation_1.VendorImplementation {
    constructor() {
        super(...arguments);
        this._deviceInfo = null;
        this.callState = 0;
        this.recCallState = 0;
        this.isHold = false;
        this.inputReportReportId = null;
        this.vendorName = 'Yealink';
    }
    static getInstance(config) {
        if (!YealinkService.instance) {
            YealinkService.instance = new YealinkService(config);
        }
        return YealinkService.instance;
    }
    get deviceInfo() {
        return this._deviceInfo;
    }
    isSupported() {
        return window.navigator.hid && !(0, utils_1.isCefHosted)();
    }
    deviceLabelMatchesVendor(label) {
        const lowerLabel = label.toLowerCase();
        return ['yealink', '(6993:'].some(searchVal => lowerLabel.includes(searchVal));
    }
    connect(originalDeviceLabel = '', options) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.isConnecting) {
                this.changeConnectionStatus({ isConnected: this.isConnected, isConnecting: true });
            }
            const deviceLabel = originalDeviceLabel.toLowerCase();
            const manualSelection = !!(options === null || options === void 0 ? void 0 : options.manualProviderSelection);
            const deviceList = yield window.navigator.hid.getDevices();
            deviceList.forEach(device => {
                var _a;
                if (!this.activeDevice) {
                    if (manualSelection || deviceLabel.includes((_a = device === null || device === void 0 ? void 0 : device.productName) === null || _a === void 0 ? void 0 : _a.toLowerCase())) {
                        for (const collection of device.collections) {
                            if (collection.usage === HEADSET_USAGE &&
                                collection.usagePage === HEADSET_USAGE_PAGE) {
                                this.activeDevice = device;
                                if (collection.inputReports.length !== 0) {
                                    this.inputReportReportId = HEADSET_REPORT_ID;
                                }
                                break;
                            }
                        }
                    }
                }
            });
            if (!this.activeDevice) {
                try {
                    this.activeDevice = yield new Promise((resolve, reject) => {
                        const waiter = setTimeout(reject, 30000);
                        this.requestWebHidPermissions(() => __awaiter(this, void 0, void 0, function* () {
                            const productId = this.deductProductId(originalDeviceLabel);
                            const filters = [{ usage: HEADSET_USAGE, usagePage: HEADSET_USAGE_PAGE, vendorId: VENDOR_ID, productId: productId || undefined }];
                            const requestedDevices = yield window.navigator.hid.requestDevice({ filters });
                            clearTimeout(waiter);
                            const deviceLists = manualSelection
                                ? requestedDevices
                                : yield window.navigator.hid.getDevices();
                            let bFind = false;
                            deviceLists.forEach(device => {
                                var _a;
                                if (manualSelection || deviceLabel.includes((_a = device === null || device === void 0 ? void 0 : device.productName) === null || _a === void 0 ? void 0 : _a.toLowerCase())) {
                                    for (const collection of device.collections) {
                                        if (collection.usage === HEADSET_USAGE
                                            && collection.usagePage === HEADSET_USAGE_PAGE) {
                                            bFind = true;
                                            if (collection.inputReports.length !== 0) {
                                                this.inputReportReportId = HEADSET_REPORT_ID;
                                            }
                                            resolve(device);
                                            break;
                                        }
                                    }
                                }
                            });
                            if (!bFind) {
                                reject();
                            }
                        }));
                    });
                }
                catch (error) {
                    this.isConnecting && this.changeConnectionStatus({ isConnected: this.isConnected, isConnecting: false });
                    this.logger.error('The selected device was not granted WebHID permissions');
                    return;
                }
            }
            if (!this.activeDevice.opened) {
                yield this.activeDevice.open();
            }
            this.logger.debug(`get device reportId ${this.inputReportReportId}`);
            this.activeDevice.addEventListener('inputreport', (event) => {
                if (event.reportId !== this.inputReportReportId) {
                    return;
                }
                const value = event.data.getUint8(0);
                this.processBtnPress(value);
            });
            this._deviceInfo = {
                ProductName: this.activeDevice.productName,
            };
            if (this.isConnecting && !this.isConnected) {
                this.changeConnectionStatus({ isConnected: true, isConnecting: false });
            }
        });
    }
    disconnect() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.isConnected || this.isConnecting) {
                this.changeConnectionStatus({ isConnected: false, isConnecting: false });
            }
            if (this.activeDevice) {
                this.activeDevice.close();
                this.activeDevice = null;
                this._deviceInfo = null;
                this.inputReportReportId = 0;
            }
        });
    }
    processBtnPress(value) {
        if (!this.activeDevice) {
            this.logger.error('do not have active device');
            return;
        }
        this.logger.debug(`User pressed button ${value}. local ${this.recCallState}`);
        const changeFlag = value ^ this.recCallState;
        if (changeFlag === 0) {
            return;
        }
        if (value !== 0
            && (this.callState & (~muteFlag)) === 0) {
            this.logger.debug(`Not talking, ignore key`);
            return;
        }
        this.recCallState = value;
        if (changeFlag & offhookFlag) {
            if (value & offhookFlag) {
                this.answerCall();
                if (this.activeConversationId) {
                    this.deviceAnsweredCall({
                        name: 'OffHook',
                        conversationId: this.activeConversationId,
                    });
                }
                else {
                    this.logger.debug(`activeConversationId is empty`);
                }
            }
            else if (!this.isHold) {
                this.sendOpToDevice(this.isMuted ? muteFlag : 0);
                if (this.activeConversationId) {
                    this.deviceEndedCall({
                        name: 'OnHook',
                        conversationId: this.activeConversationId,
                    });
                }
                else {
                    this.logger.debug(`activeConversationId is empty`);
                }
                this.activeConversationId = null;
            }
        }
        else if (changeFlag & recMuteFlag) {
            if (value & recMuteFlag) {
                this.setMute(!this.isMuted);
                this.deviceMuteChanged({
                    isMuted: this.isMuted,
                    name: this.isMuted ? 'CallMuted' : 'CallUnmuted',
                    conversationId: this.activeConversationId,
                });
            }
        }
        else if (changeFlag & holdFlag) {
            if (value & holdFlag) {
                this.setHold(null, !this.isHold);
                this.deviceHoldStatusChanged({
                    holdRequested: this.isHold,
                    name: this.isHold ? 'OnHold' : 'ResumeCall',
                    conversationId: this.activeConversationId,
                });
            }
        }
        else if (changeFlag & recReject) {
            if (value & recReject) {
                this.deviceRejectedCall({
                    name: 'Reject',
                    conversationId: this.pendingConversationId,
                });
                this.rejectCall();
            }
        }
    }
    incomingCall(callInfo) {
        return __awaiter(this, void 0, void 0, function* () {
            if (callInfo) {
                this.pendingConversationId = callInfo.conversationId;
                const val = this.isMuted ? muteFlag : 0;
                this.sendOpToDevice(val | ringFlag);
            }
        });
    }
    outgoingCall(callInfo) {
        return __awaiter(this, void 0, void 0, function* () {
            this.pendingConversationId = callInfo.conversationId;
            this.sendOpToDevice(offhookFlag);
        });
    }
    answerCall() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.pendingConversationId) {
                this.activeConversationId = this.pendingConversationId;
                this.pendingConversationId = null;
            }
            const val = this.isMuted ? muteFlag : 0;
            this.sendOpToDevice(val | offhookFlag);
        });
    }
    rejectCall() {
        return __awaiter(this, void 0, void 0, function* () {
            this.pendingConversationId = null;
            this.sendOpToDevice(this.isMuted ? muteFlag : 0);
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
            // keep mute state
            this.sendOpToDevice(this.isMuted ? muteFlag : 0);
        });
    }
    endAllCalls() {
        return __awaiter(this, void 0, void 0, function* () {
            this.activeConversationId = null;
            this.sendOpToDevice(this.isMuted ? muteFlag : 0);
        });
    }
    setMute(value) {
        return __awaiter(this, void 0, void 0, function* () {
            if (value) {
                this.sendOpToDevice(this.callState | muteFlag);
            }
            else {
                this.sendOpToDevice(this.callState & (~muteFlag));
            }
        });
    }
    setHold(conversationId, value) {
        return __awaiter(this, void 0, void 0, function* () {
            if (value) {
                const setValue = this.callState & (~offhookFlag);
                this.sendOpToDevice(setValue | holdFlag);
            }
            else {
                const setValue = this.callState & (~holdFlag);
                this.sendOpToDevice(setValue | offhookFlag);
            }
        });
    }
    sendOpToDevice(value) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.activeDevice || this.inputReportReportId === 0) {
                this.logger.error('do not have active device');
                return;
            }
            if (value & holdFlag) {
                this.isHold = true;
            }
            else {
                this.isHold = false;
            }
            if (value & muteFlag) {
                this.isMuted = true;
            }
            else {
                this.isMuted = false;
            }
            this.logger.debug(`send to dev ${value}`);
            this.callState = value;
            yield this.activeDevice.sendReport(this.inputReportReportId, new Uint8Array([value]));
        });
    }
}
exports.default = YealinkService;
//# sourceMappingURL=yealink.js.map