"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const vendor_implementation_1 = require("../vendor-implementation");
const utils = __importStar(require("../../../utils"));
const types_1 = require("./types");
const websocketUri = 'wss://127.0.0.1:41088';
class SennheiserService extends vendor_implementation_1.VendorImplementation {
    constructor() {
        super(...arguments);
        this.connectTimeout = 5000;
        this.vendorName = 'Sennheiser';
        this.isActive = false;
        this.devices = null;
        this.activeDeviceId = null;
        this.websocketConnected = false;
        this.websocket = null;
        this.deviceInfo = null;
        this.ignoreAcknowledgement = false;
        this.connectionGeneration = 0;
        this.webSocketOnOpen = (socket = this.websocket, generation = this.connectionGeneration) => {
            if (!this.ownsSocket(socket, generation)) {
                return;
            }
            this.websocketConnected = true;
            this.logger.info('websocket open the sennheiser software');
        };
    }
    static getInstance(config) {
        if (!SennheiserService.instance || config.createNew) {
            SennheiserService.instance = new SennheiserService(config);
        }
        return SennheiserService.instance;
    }
    deviceLabelMatchesVendor(label) {
        const lowerLabel = label.toLowerCase();
        return ['senn', 'epos'].some(searchVal => lowerLabel.includes(searchVal));
    }
    get deviceName() {
        return this.deviceInfo && this.deviceInfo.ProductName;
    }
    get isDeviceAttached() {
        return !!this.deviceInfo;
    }
    resetHeadsetStateForCall(conversationId) {
        this.ignoreAcknowledgement = true;
        return this.endCall(conversationId);
    }
    _handleError(payload) {
        this.logger.error('Non-zero return code from sennheiser', payload);
    }
    _handleAck(payload) {
        this.logger.debug(`Received Ack for ${payload.Event}`);
    }
    _sendMessage(payload) {
        if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
            this.logger.warn('Cannot send sennheiser message because the active socket is not open', { event: payload.Event });
            return;
        }
        this.logger.debug('sending sennheiser message', payload);
        this.websocket.send(JSON.stringify(payload));
    }
    _registerSoftphone() {
        const payload = {
            Event: types_1.SennheiserEvents.EstablishConnection,
            EventType: types_1.SennheiserEventTypes.Request,
            SPName: this.config.appName || 'Genesys Cloud Softphone',
            SPIconImage: 'SPImage.ico',
            RedialSupport: 'No',
            OffHookSupport: 'No',
            MuteSupport: 'Yes',
            DNDOption: 'No',
        };
        this._sendMessage(payload);
    }
    connect() {
        this.retireSocket(this.websocket, this.connectionGeneration, true);
        this.ignoreAcknowledgement = false;
        !this.isConnecting && this.changeConnectionStatus({ isConnected: false, isConnecting: true });
        const socket = new WebSocket(websocketUri);
        const generation = ++this.connectionGeneration;
        this.websocket = socket;
        socket.onopen = () => this.webSocketOnOpen(socket, generation);
        socket.onclose = (event) => this.webSocketOnClose(event, socket, generation);
        socket.onmessage = (message) => this._handleMessage(message, socket, generation);
        return Promise.resolve();
    }
    webSocketOnClose(err, socket = this.websocket, generation = this.connectionGeneration) {
        if (!this.ownsSocket(socket, generation)) {
            return;
        }
        this.websocket = null;
        this.connectionGeneration++;
        this.websocketConnected = false;
        this.deviceInfo = null;
        if (!err.wasClean) {
            this.logger.error(err);
        }
        if (!this.isConnected) {
            this.logger.error(new Error('Failed to connect to sennheiser software. Make sure it is installed'));
            if (utils.isFirefox()) {
                this.errorCode = 'browser';
                this.disableRetry = true;
            }
        }
        if (this.isConnected || this.isConnecting) {
            this.changeConnectionStatus({ isConnected: false, isConnecting: false });
        }
    }
    disconnect() {
        this.retireSocket(this.websocket, this.connectionGeneration, true);
        return Promise.resolve();
    }
    setMute(value) {
        this._sendMessage({
            Event: value ? types_1.SennheiserEvents.MuteFromApp : types_1.SennheiserEvents.UnmuteFromApp,
            EventType: types_1.SennheiserEventTypes.Request,
        });
        return Promise.resolve();
    }
    setHold(conversationId, value) {
        this._sendMessage({
            Event: value ? types_1.SennheiserEvents.Hold : types_1.SennheiserEvents.Resume,
            EventType: types_1.SennheiserEventTypes.Request,
            CallID: conversationId,
        });
        return Promise.resolve();
    }
    incomingCall(callInfo) {
        this.ignoreAcknowledgement = false;
        this._sendMessage({
            Event: types_1.SennheiserEvents.IncomingCall,
            EventType: types_1.SennheiserEventTypes.Request,
            CallID: callInfo.conversationId,
        });
        return Promise.resolve();
    }
    answerCall(conversationId, autoAnswer) {
        if (autoAnswer) {
            this.incomingCall({ conversationId });
        }
        this._sendMessage({
            Event: types_1.SennheiserEvents.IncomingCallAccepted,
            EventType: types_1.SennheiserEventTypes.Request,
            CallID: conversationId,
        });
        return Promise.resolve();
    }
    rejectCall(conversationId) {
        this._sendMessage({
            Event: types_1.SennheiserEvents.IncomingCallRejected,
            EventType: types_1.SennheiserEventTypes.Request,
            CallID: conversationId,
        });
        return Promise.resolve();
    }
    outgoingCall(callInfo) {
        this.ignoreAcknowledgement = false;
        const { conversationId } = callInfo;
        this._sendMessage({
            Event: types_1.SennheiserEvents.OutgoingCall,
            EventType: types_1.SennheiserEventTypes.Request,
            CallID: conversationId,
        });
        return Promise.resolve();
    }
    endCall(conversationId, hasOtherActiveCalls) {
        if (!hasOtherActiveCalls) {
            this._sendMessage({
                Event: types_1.SennheiserEvents.Resume,
                EventType: types_1.SennheiserEventTypes.Request
            });
            this._sendMessage({
                Event: types_1.SennheiserEvents.UnmuteFromApp,
                EventType: types_1.SennheiserEventTypes.Request,
            });
        }
        this._sendMessage({
            Event: types_1.SennheiserEvents.CallEnded,
            EventType: types_1.SennheiserEventTypes.Request,
            CallID: conversationId,
        });
        return Promise.resolve();
    }
    endAllCalls() {
        this.logger.warn('There is no functionality defined for SennheiserService.endAllCalls()');
        return Promise.resolve();
    }
    _handleMessage(message, socket = this.websocket, generation = this.connectionGeneration) {
        if (!this.ownsSocket(socket, generation)) {
            return;
        }
        let payload;
        try {
            payload = JSON.parse(message.data);
        }
        catch (err) {
            this.logger.error(err);
            this.logger.error('Failed to parse sennheiser payload', { message });
            return;
        }
        this.logger.debug('incoming sennheiser message', payload);
        if (payload.ReturnCode) {
            this._handleError(payload);
            return;
        }
        const conversationId = payload.CallID;
        if (!this.ignoreAcknowledgement) {
            switch (payload.Event) {
                case types_1.SennheiserEvents.SocketConnected:
                    this._registerSoftphone();
                    break;
                case types_1.SennheiserEvents.EstablishConnection:
                    this._sendMessage({
                        Event: types_1.SennheiserEvents.SPLogin,
                        EventType: types_1.SennheiserEventTypes.Request,
                    });
                    break;
                case types_1.SennheiserEvents.SPLogin:
                    if (!this.isConnected || this.isConnecting) {
                        this.changeConnectionStatus({ isConnected: true, isConnecting: false });
                    }
                    this._sendMessage({
                        Event: types_1.SennheiserEvents.SystemInformation,
                        EventType: types_1.SennheiserEventTypes.Request,
                    });
                    break;
                case types_1.SennheiserEvents.HeadsetConnected:
                    if (payload.HeadsetName) {
                        this.deviceInfo = {
                            deviceName: payload.HeadsetName,
                            headsetType: payload.HeadsetType,
                        };
                    }
                    break;
                case types_1.SennheiserEvents.HeadsetDisconnected:
                    if (payload.HeadsetName === this.deviceName) {
                        this.deviceInfo = null;
                    }
                    break;
                case types_1.SennheiserEvents.IncomingCallAccepted:
                    if (payload.EventType === types_1.SennheiserEventTypes.Notification) {
                        this.deviceAnsweredCall({ name: payload.Event, conversationId });
                    }
                    break;
                case types_1.SennheiserEvents.Hold:
                    if (payload.EventType === types_1.SennheiserEventTypes.Ack) {
                        this._handleAck(payload);
                        break;
                    }
                    this.deviceHoldStatusChanged({ holdRequested: true, name: payload.Event, conversationId });
                    break;
                case types_1.SennheiserEvents.Resume:
                    if (payload.EventType === types_1.SennheiserEventTypes.Ack) {
                        this._handleAck(payload);
                        break;
                    }
                    this.deviceHoldStatusChanged({ holdRequested: false, name: payload.Event, conversationId });
                    break;
                case types_1.SennheiserEvents.MuteFromHeadset:
                    this.deviceMuteChanged({ isMuted: true, name: payload.Event });
                    break;
                case types_1.SennheiserEvents.UnmuteFromHeadset:
                    this.deviceMuteChanged({ isMuted: false, name: payload.Event });
                    break;
                case types_1.SennheiserEvents.CallEnded:
                    if (payload.EventType === types_1.SennheiserEventTypes.Notification) {
                        this._sendMessage({
                            Event: types_1.SennheiserEvents.UnmuteFromApp,
                            EventType: types_1.SennheiserEventTypes.Request,
                        });
                        this.deviceEndedCall({ name: payload.Event, conversationId });
                    }
                    break;
                case types_1.SennheiserEvents.IncomingCallRejected:
                    if (payload.EventType === types_1.SennheiserEventTypes.Notification) {
                        this.deviceRejectedCall({ name: payload.Event, conversationId });
                    }
                    break;
                case types_1.SennheiserEvents.TerminateConnection:
                    this.retireSocket(socket, generation, false);
                    break;
                default:
                    if (payload.EventType === types_1.SennheiserEventTypes.Ack) {
                        // this is mostly for testing purposes so we can confirm reciept of events we don't normally care about
                        this._handleAck(payload);
                    }
                    break;
            }
        }
    }
    ownsSocket(socket, generation) {
        return socket === this.websocket && generation === this.connectionGeneration;
    }
    retireSocket(socket, generation, sendTerminate) {
        if (!socket || !this.ownsSocket(socket, generation)) {
            if (!socket && (this.isConnected || this.isConnecting)) {
                this.changeConnectionStatus({ isConnected: false, isConnecting: false });
            }
            return;
        }
        this.websocket = null;
        this.connectionGeneration++;
        this.websocketConnected = false;
        this.deviceInfo = null;
        if (sendTerminate && socket.readyState === WebSocket.OPEN) {
            try {
                socket.send(JSON.stringify({
                    Event: types_1.SennheiserEvents.TerminateConnection,
                    EventType: types_1.SennheiserEventTypes.Request,
                }));
            }
            catch (error) {
                this.logger.warn('Failed to send sennheiser termination message before closing');
            }
        }
        if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) {
            try {
                socket.close();
            }
            catch (error) {
                this.logger.warn('Failed to close sennheiser websocket');
            }
        }
        if (this.isConnected || this.isConnecting) {
            this.changeConnectionStatus({ isConnected: false, isConnecting: false });
        }
    }
}
exports.default = SennheiserService;
//# sourceMappingURL=sennheiser.js.map