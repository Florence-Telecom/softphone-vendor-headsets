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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fetch_jsonp_1 = __importDefault(require("fetch-jsonp"));
const vendor_implementation_1 = require("../vendor-implementation");
const plantronics_call_events_1 = require("./plantronics-call-events");
const browserama_1 = __importDefault(require("browserama"));
const defaultAppName = 'genesys-cloud-headset-library';
/**
 * TODO:  This looks like a feasible way to implement the polling we need
 *        https://makeitnew.io/polling-using-rxjs-8347d05e9104
 *  */
class PlantronicsService extends vendor_implementation_1.VendorImplementation {
    constructor(config) {
        super(config);
        this.activePollingInterval = 2000;
        this.connectedDeviceInterval = 6000;
        this.disconnectedDeviceInterval = 2000;
        this.deviceIdRetryInterval = 2000;
        this.vendorName = 'Plantronics';
        this.apiHost = 'https://127.0.0.1:32018/Spokes';
        this.isActive = false;
        this.disableEventPolling = false;
        this.deviceStatusTimer = null;
        this.isRetry = false;
        this.callMappings = {};
        this.config = config;
        this.pluginName = config.appName || defaultAppName;
        this._deviceInfo = null;
        this.callEventsTimerId = null;
        this.deviceStatusTimerId = null;
        this.incomingConversationId = null;
    }
    _createCallMapping(conversationId) {
        const ID_LENGTH = 8;
        const callId = Math.round(Math.random() * Math.pow(10, ID_LENGTH)); // Generate random number
        this.callMappings[conversationId] = callId;
        this.callMappings[callId] = conversationId;
        this.logger.info('Created callId mapping for plantronics headset', {
            conversationId,
            plantronicsCallId: callId,
        });
        return callId;
    }
    clearTimeouts() {
        clearTimeout(this.callEventsTimerId);
        clearTimeout(this.deviceStatusTimerId);
    }
    deviceLabelMatchesVendor(label) {
        // includes vendor name or vendorId (chrome only)
        const lowerLabel = label.toLowerCase();
        return ['plantronics', 'plt', 'poly', '(047f:'].some(searchVal => lowerLabel.includes(searchVal));
    }
    static getInstance(config) {
        if (!PlantronicsService.instance || config.createNew) {
            PlantronicsService.instance = new PlantronicsService(config);
        }
        return PlantronicsService.instance;
    }
    get deviceName() {
        var _a;
        return (_a = this._deviceInfo) === null || _a === void 0 ? void 0 : _a.ProductName;
    }
    get deviceInfo() {
        return this._deviceInfo;
    }
    get isDeviceAttached() {
        return !!this.deviceInfo;
    }
    pollForCallEvents() {
        if (this.callEventsTimerId) {
            clearTimeout(this.callEventsTimerId);
            this.callEventsTimerId = null;
        }
        // if(this.isConnected && this.isActive && !this.disableEventPolling) {
        if (this.isConnected && !this.disableEventPolling) {
            this.logger.debug('**** POLLING FOR CALL EVENTS ****');
            this.getCallEvents();
        }
        this.callEventsTimerId = setTimeout(() => {
            this.pollForCallEvents();
        }, this.activePollingInterval);
    }
    pollForDeviceStatus() {
        if (this.deviceStatusTimerId) {
            clearTimeout(this.deviceStatusTimerId);
            this.deviceStatusTimerId = null;
        }
        if (this.isConnected && !this.isConnecting && !this.disableEventPolling) {
            this.logger.debug('**** POLLING FOR DEVICE STATUS ****');
            this.getDeviceStatus();
        }
        this.deviceStatusTimerId = setTimeout(() => {
            this.pollForDeviceStatus();
        }, this.isDeviceAttached ? this.connectedDeviceInterval : this.disconnectedDeviceInterval);
    }
    _makeRequestTask(endpoint, isRetry) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this._makeRequest(endpoint, isRetry);
        });
    }
    _fetch(url) {
        return (0, fetch_jsonp_1.default)(url);
    }
    _makeRequest(endpoint, isRetry) {
        return __awaiter(this, void 0, void 0, function* () {
            const plantronicsInstance = PlantronicsService.instance;
            return this._fetch(`${this.apiHost}${endpoint}`)
                .then(response => {
                return response.json();
            })
                .then(response => {
                // we should just eat the response if we are not connected and not trying to connect
                if (!this.isConnected && !this.isConnecting) {
                    return;
                }
                if (response.ok === false || response.Type_Name === 'Error') {
                    if (response.status === 404) {
                        if (isRetry) {
                            this.isConnected && this.changeConnectionStatus({ isConnected: false, isConnecting: this.isConnecting });
                            this.disconnect();
                            const error = new Error('Headset: Failed connection to middleware. Headset features unavailable.');
                            error.handled = true;
                            this.logger.info(error);
                            return Promise.reject(error);
                        }
                        return this._makeRequestTask(endpoint, true);
                    }
                    if (browserama_1.default.isFirefox) {
                        this.errorCode = 'browser';
                        this.disableRetry = true;
                    }
                    return Promise.reject(response);
                }
                else {
                    if (!plantronicsInstance) {
                        return Promise.reject(new Error('Application destroyed.'));
                    }
                    !this.isConnected && this.changeConnectionStatus({ isConnected: true, isConnecting: this.isConnecting });
                    return response;
                }
            })
                .catch(error => {
                return Promise.reject(error);
            });
        });
    }
    _checkIsActiveTask() {
        return __awaiter(this, void 0, void 0, function* () {
            const calls = yield this._getActiveCalls();
            this.isActive = !!calls.length;
        });
    }
    _getActiveCalls() {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            let result;
            try {
                const request = yield this._makeRequestTask(`/CallServices/CallManagerState?`);
                result = request;
            }
            catch (e) {
                this.logger.info('Error making request for active calls', e);
                return [];
            }
            if (!Array.isArray((_a = result === null || result === void 0 ? void 0 : result.Result) === null || _a === void 0 ? void 0 : _a.Calls)) {
                return [];
            }
            return result.Result.Calls.filter(call => call.Source === this.pluginName);
        });
    }
    getCallEvents() {
        return __awaiter(this, void 0, void 0, function* () {
            let response;
            try {
                response = yield this._makeRequestTask(`/CallServices/CallEvents?name=${this.pluginName}`);
            }
            catch (e) {
                this.logger.info('Error making request for call events', e);
                return;
            }
            if (response.Result) {
                response.Result.forEach((event) => {
                    const eventType = plantronics_call_events_1.PlantronicsCallEventCodes[event.Action];
                    if (!eventType) {
                        return this.logger.info('Unknown call event from headset', { event });
                    }
                    const eventInfo = { name: eventType, event };
                    this.logger.debug('headset info', eventInfo);
                    this.callCorrespondingFunction(eventInfo);
                });
            }
        });
    }
    getDeviceStatus() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this._makeRequestTask(`/DeviceServices/Info`)
                .then(response => {
                this._deviceInfo = response.Result;
            })
                .catch(err => {
                const noDevicesError = err.Err && err.Err.Description.includes('no supported devices');
                if (!noDevicesError) {
                    this.logger.info('Error making request for device status', err);
                }
            });
        });
    }
    callCorrespondingFunction(eventInfo) {
        const callId = eventInfo.event.CallId.Id;
        const conversationId = this.callMappings[callId];
        switch (eventInfo.name) {
            case 'AcceptCall':
                this.deviceAnsweredCall(Object.assign(Object.assign({}, eventInfo), { conversationId }));
                break;
            case 'RejectCall':
                this.endCall(conversationId);
                this.deviceRejectedCall({ name: eventInfo.name, conversationId: this.incomingConversationId });
                break;
            case 'TerminateCall':
                this.setMute(false);
                this.setHold(conversationId, false);
                this.deviceEndedCall(Object.assign(Object.assign({}, eventInfo), { conversationId }));
                break;
            case 'CallEnded':
                delete this.callMappings[callId];
                delete this.callMappings[conversationId];
                this._checkIsActiveTask();
                break;
            case 'Mute':
                this.deviceMuteChanged(Object.assign(Object.assign({ isMuted: true }, eventInfo), { conversationId }));
                break;
            case 'Unmute':
                this.deviceMuteChanged(Object.assign(Object.assign({ isMuted: false }, eventInfo), { conversationId }));
                break;
            case 'HoldCall':
                this.deviceHoldStatusChanged(Object.assign(Object.assign({ holdRequested: true }, eventInfo), { conversationId }));
                break;
            case 'ResumeCall':
                this.deviceHoldStatusChanged(Object.assign(Object.assign({ holdRequested: false }, eventInfo), { conversationId }));
                break;
            default:
                this.logger.info('A headset event has occurred', Object.assign(Object.assign({}, eventInfo), { conversationId }));
                this.deviceEventLogs(Object.assign(Object.assign({}, eventInfo), { conversationId }));
        }
    }
    unregisterPlugin() {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            try {
                return yield this._makeRequestTask(`/SessionManager/UnRegister?name=${this.pluginName}`);
            }
            catch (response) {
                if (((_a = response === null || response === void 0 ? void 0 : response.Err) === null || _a === void 0 ? void 0 : _a.Description) === 'Invalid plugin name') {
                    return;
                }
                this.logger.error(response);
            }
        });
    }
    connect() {
        return __awaiter(this, void 0, void 0, function* () {
            !this.isConnecting && this.changeConnectionStatus({ isConnected: this.isConnected, isConnecting: true });
            this.pollForDeviceStatus();
            this.pollForCallEvents();
            yield this.unregisterPlugin();
            return this._makeRequestTask(`/SessionManager/Register?name=${this.pluginName}`)
                .catch(response => {
                if (response.Err && response.Err.Description === 'Plugin exists') {
                    return this.logger.debug('Plugin already exists', response);
                }
                return Promise.reject(response);
            })
                .then(() => this._makeRequestTask(`/SessionManager/IsActive?name=${this.pluginName}&active=true`))
                .catch(response => {
                if (response.Err && !response.isError) {
                    return this.logger.debug('Is Active', response);
                }
                return Promise.reject(response);
            })
                .then(response => {
                if ((response === null || response === void 0 ? void 0 : response.Result) !== true) {
                    return Promise.reject(response);
                }
                return this._makeRequestTask(`/UserPreference/SetDefaultSoftPhone?name=${this.pluginName}`);
            })
                .then(() => {
                this.getDeviceStatus();
            })
                .then(() => {
                return this._getActiveCalls();
            })
                .then(calls => {
                if (calls.length) {
                    this.isActive = true;
                    this.logger.warn('Plantronics headset should be in vanilla state but is reporting active call state.');
                }
                else {
                    return this.getCallEvents();
                }
            })
                .catch(err => {
                if (!(err === null || err === void 0 ? void 0 : err.handled)) {
                    return Promise.reject(err);
                }
                return this.logger.error('Unable to properly connect headset');
            })
                .finally(() => {
                this.isConnecting && this.changeConnectionStatus({ isConnected: this.isConnected, isConnecting: false });
            });
        });
    }
    disconnect(clearReason) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.isConnected) {
                return;
            }
            if (clearReason !== 'alternativeClient') {
                yield this.unregisterPlugin();
            }
            this.clearTimeouts();
            this._deviceInfo = null;
            this.isConnected && this.changeConnectionStatus({ isConnected: false, isConnecting: this.isConnecting });
            this.isActive = false;
        });
    }
    incomingCall(callInfo) {
        this.logger.info('Inside incomingCall of selected implementation (Plantronics/Poly)');
        const { conversationId, contactName } = callInfo;
        if (!conversationId) {
            throw new Error('Must provide conversationId');
        }
        // this is because plantronics only accepts numeric callIds, so we have to make one up
        const callId = this._createCallMapping(conversationId);
        this.incomingConversationId = conversationId;
        let params = `?name=${this.pluginName}&tones=Unknown&route=ToHeadset`;
        const halfEncodedCallIdString = `"Id":"${callId}"`;
        params += `&callID={${encodeURI(halfEncodedCallIdString)}}`;
        if (contactName) {
            const halfEncodedContactString = `"Name":"${contactName}"`;
            params += `&contact={${encodeURI(halfEncodedContactString)}}`;
        }
        this.logger.info('params of endpoint', params);
        this.isActive = true;
        return this._makeRequestTask(`/CallServices/IncomingCall${params}`);
    }
    outgoingCall({ conversationId, contactName }) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!conversationId) {
                throw new Error('Must provide conversationId');
            }
            // this is because plantronics only accepts numeric callIds, so we have to make one up
            const callId = this._createCallMapping(conversationId);
            let params = `?name=${this.pluginName}&tones=Unknown&route=ToHeadset`;
            const halfEncodedCallIdString = `"Id":"${callId}"`;
            params += `&callID={${encodeURI(halfEncodedCallIdString)}}`;
            if (contactName) {
                const halfEncodedContactString = `"Name":"${contactName}"`;
                params += `&contact={${encodeURI(halfEncodedContactString)}}`;
            }
            this.isActive = true;
            yield this._makeRequestTask(`/CallServices/OutgoingCall${params}`);
        });
    }
    answerCall(conversationId, autoAnswer) {
        return __awaiter(this, void 0, void 0, function* () {
            if (autoAnswer) {
                yield this.incomingCall({ conversationId });
            }
            const callId = this.callMappings[conversationId];
            const halfEncodedCallIdString = `"Id":"${callId}"`;
            const params = `?name=${this.pluginName}&callID={${encodeURI(halfEncodedCallIdString)}}`;
            this.isActive = true;
            this.incomingConversationId = null;
            return this._makeRequestTask(`/CallServices/AnswerCall${params}`);
        });
    }
    rejectCall(conversationId) {
        this.incomingConversationId = null;
        return this.endCall(conversationId);
    }
    endCall(conversationId) {
        return __awaiter(this, void 0, void 0, function* () {
            let params = `?name=${this.pluginName}`;
            const callId = this.callMappings[conversationId];
            const halfEncodedCallIdString = `"Id":"${callId}"`;
            params += `&callID={${encodeURI(halfEncodedCallIdString)}}`;
            const response = yield this._makeRequestTask(`/CallServices/TerminateCall${params}`);
            this.setMute(false);
            this.setHold(conversationId, false);
            yield this.getCallEvents();
            this._checkIsActiveTask();
            return response;
        });
    }
    endAllCalls() {
        return __awaiter(this, void 0, void 0, function* () {
            const calls = yield this._getActiveCalls();
            calls.forEach(call => this.endCall(this.callMappings[call.CallId]));
        });
    }
    setMute(value) {
        return __awaiter(this, void 0, void 0, function* () {
            const response = yield this._makeRequestTask(`/CallServices/MuteCall?name=${this.pluginName}&muted=${value}`);
            return response;
        });
    }
    setHold(conversationId, value) {
        return __awaiter(this, void 0, void 0, function* () {
            const callId = this.callMappings[conversationId];
            const halfEncodedCallIdString = `"Id":"${callId}"`;
            const params = `?name=${this.pluginName}&callID={${encodeURI(halfEncodedCallIdString)}}`;
            const response = yield this._makeRequestTask(`/CallServices/${value ? 'HoldCall' : 'ResumeCall'}${params}`);
            return response;
        });
    }
}
exports.default = PlantronicsService;
//# sourceMappingURL=plantronics.js.map