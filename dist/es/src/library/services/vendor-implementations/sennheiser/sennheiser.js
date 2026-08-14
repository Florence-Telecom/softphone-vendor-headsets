import { VendorImplementation } from '../vendor-implementation';
import * as utils from '../../../utils';
import { SennheiserEvents, SennheiserEventTypes } from './types';
const websocketUri = 'wss://127.0.0.1:41088';
export default class SennheiserService extends VendorImplementation {
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
            Event: SennheiserEvents.EstablishConnection,
            EventType: SennheiserEventTypes.Request,
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
            Event: value ? SennheiserEvents.MuteFromApp : SennheiserEvents.UnmuteFromApp,
            EventType: SennheiserEventTypes.Request,
        });
        return Promise.resolve();
    }
    setHold(conversationId, value) {
        this._sendMessage({
            Event: value ? SennheiserEvents.Hold : SennheiserEvents.Resume,
            EventType: SennheiserEventTypes.Request,
            CallID: conversationId,
        });
        return Promise.resolve();
    }
    incomingCall(callInfo) {
        this.ignoreAcknowledgement = false;
        this._sendMessage({
            Event: SennheiserEvents.IncomingCall,
            EventType: SennheiserEventTypes.Request,
            CallID: callInfo.conversationId,
        });
        return Promise.resolve();
    }
    answerCall(conversationId, autoAnswer) {
        if (autoAnswer) {
            this.incomingCall({ conversationId });
        }
        this._sendMessage({
            Event: SennheiserEvents.IncomingCallAccepted,
            EventType: SennheiserEventTypes.Request,
            CallID: conversationId,
        });
        return Promise.resolve();
    }
    rejectCall(conversationId) {
        this._sendMessage({
            Event: SennheiserEvents.IncomingCallRejected,
            EventType: SennheiserEventTypes.Request,
            CallID: conversationId,
        });
        return Promise.resolve();
    }
    outgoingCall(callInfo) {
        this.ignoreAcknowledgement = false;
        const { conversationId } = callInfo;
        this._sendMessage({
            Event: SennheiserEvents.OutgoingCall,
            EventType: SennheiserEventTypes.Request,
            CallID: conversationId,
        });
        return Promise.resolve();
    }
    endCall(conversationId, hasOtherActiveCalls) {
        if (!hasOtherActiveCalls) {
            this._sendMessage({
                Event: SennheiserEvents.Resume,
                EventType: SennheiserEventTypes.Request
            });
            this._sendMessage({
                Event: SennheiserEvents.UnmuteFromApp,
                EventType: SennheiserEventTypes.Request,
            });
        }
        this._sendMessage({
            Event: SennheiserEvents.CallEnded,
            EventType: SennheiserEventTypes.Request,
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
                case SennheiserEvents.SocketConnected:
                    this._registerSoftphone();
                    break;
                case SennheiserEvents.EstablishConnection:
                    this._sendMessage({
                        Event: SennheiserEvents.SPLogin,
                        EventType: SennheiserEventTypes.Request,
                    });
                    break;
                case SennheiserEvents.SPLogin:
                    if (!this.isConnected || this.isConnecting) {
                        this.changeConnectionStatus({ isConnected: true, isConnecting: false });
                    }
                    this._sendMessage({
                        Event: SennheiserEvents.SystemInformation,
                        EventType: SennheiserEventTypes.Request,
                    });
                    break;
                case SennheiserEvents.HeadsetConnected:
                    if (payload.HeadsetName) {
                        this.deviceInfo = {
                            deviceName: payload.HeadsetName,
                            headsetType: payload.HeadsetType,
                        };
                    }
                    break;
                case SennheiserEvents.HeadsetDisconnected:
                    if (payload.HeadsetName === this.deviceName) {
                        this.deviceInfo = null;
                    }
                    break;
                case SennheiserEvents.IncomingCallAccepted:
                    if (payload.EventType === SennheiserEventTypes.Notification) {
                        this.deviceAnsweredCall({ name: payload.Event, conversationId });
                    }
                    break;
                case SennheiserEvents.Hold:
                    if (payload.EventType === SennheiserEventTypes.Ack) {
                        this._handleAck(payload);
                        break;
                    }
                    this.deviceHoldStatusChanged({ holdRequested: true, name: payload.Event, conversationId });
                    break;
                case SennheiserEvents.Resume:
                    if (payload.EventType === SennheiserEventTypes.Ack) {
                        this._handleAck(payload);
                        break;
                    }
                    this.deviceHoldStatusChanged({ holdRequested: false, name: payload.Event, conversationId });
                    break;
                case SennheiserEvents.MuteFromHeadset:
                    this.deviceMuteChanged({ isMuted: true, name: payload.Event });
                    break;
                case SennheiserEvents.UnmuteFromHeadset:
                    this.deviceMuteChanged({ isMuted: false, name: payload.Event });
                    break;
                case SennheiserEvents.CallEnded:
                    if (payload.EventType === SennheiserEventTypes.Notification) {
                        this._sendMessage({
                            Event: SennheiserEvents.UnmuteFromApp,
                            EventType: SennheiserEventTypes.Request,
                        });
                        this.deviceEndedCall({ name: payload.Event, conversationId });
                    }
                    break;
                case SennheiserEvents.IncomingCallRejected:
                    if (payload.EventType === SennheiserEventTypes.Notification) {
                        this.deviceRejectedCall({ name: payload.Event, conversationId });
                    }
                    break;
                case SennheiserEvents.TerminateConnection:
                    this.retireSocket(socket, generation, false);
                    break;
                default:
                    if (payload.EventType === SennheiserEventTypes.Ack) {
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
                    Event: SennheiserEvents.TerminateConnection,
                    EventType: SennheiserEventTypes.Request,
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
//# sourceMappingURL=sennheiser.js.map