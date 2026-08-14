var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { Subject } from 'rxjs';
import CyberAcousticsService from './vendor-implementations/CyberAcoustics/CyberAcoustics';
import PlantronicsService from './vendor-implementations/plantronics/plantronics';
import SennheiserService from './vendor-implementations/sennheiser/sennheiser';
import JabraService from './vendor-implementations/jabra/jabra';
import JabraNativeService from './vendor-implementations/jabra/jabra-native/jabra-native';
import YealinkService from './vendor-implementations/yealink/yealink';
import VBetService from './vendor-implementations/vbet/vbet';
import { HeadsetEvents } from '../types/consumed-headset-events';
const REMOVE_WAIT = 2000;
export default class HeadsetService {
    constructor(config) {
        this.headsetConversationStates = {};
        this.implementationTransitionGeneration = 0;
        this._headsetEvents$ = new Subject();
        this.headsetEvents$ = this._headsetEvents$.asObservable();
        this.logger = config.logger || console;
        this.plantronics = PlantronicsService.getInstance({ logger: this.logger, appName: config.appName });
        this.jabraNative = JabraNativeService.getInstance({ logger: this.logger });
        this.jabra = JabraService.getInstance({ logger: this.logger });
        this.sennheiser = SennheiserService.getInstance({
            logger: this.logger,
            appName: config.appName,
            createNew: config.createNew
        });
        this.yealink = YealinkService.getInstance({ logger: this.logger });
        this.vbet = VBetService.getInstance({ logger: this.logger });
        this.cyberAcoustics = CyberAcousticsService.getInstance({ logger: this.logger });
        [this.plantronics, this.jabra, this.jabraNative, this.sennheiser, this.yealink, this.vbet, this.cyberAcoustics].forEach(implementation => this.subscribeToHeadsetEvents(implementation));
    }
    static getInstance(config) {
        if (!HeadsetService.instance || config.createNew) {
            HeadsetService.instance = new HeadsetService(config);
        }
        return HeadsetService.instance;
    }
    get implementations() {
        const implementations = [
            this.sennheiser,
            this.plantronics,
            this.jabra,
            this.jabraNative,
            this.yealink,
            this.vbet,
            this.cyberAcoustics
        ].filter((impl) => impl.isSupported());
        return implementations;
    }
    isDifferentState(props) {
        const state = this.headsetConversationStates[props.conversationId];
        // different if there's no state or any of the provided state props don't match
        return !state || Object.entries(props.state).some(([key, value]) => state[key] !== value);
    }
    updateHeadsetState(props, opts = { expectExistingConversation: true }) {
        if (this.isDifferentState(props)) {
            const state = this.headsetConversationStates[props.conversationId];
            if (!state) {
                if (opts.expectExistingConversation) {
                    this.logger.warn('updateHeadsetState has no existing state for provided conversationId.', { conversationId: props.conversationId });
                }
                return false;
            }
            Object.assign(state, props.state);
            return true;
        }
        return false;
    }
    deviceIsSupported(params) {
        if (!params.micLabel) {
            return false;
        }
        const implementation = this.implementations.find((implementation) => {
            return implementation.deviceLabelMatchesVendor(params.micLabel);
        });
        return !!implementation;
    }
    activeMicChange(newMicLabel, changeReason) {
        if (newMicLabel) {
            const implementation = this.implementations.find((implementation) => implementation.deviceLabelMatchesVendor(newMicLabel));
            if (implementation) {
                this.changeImplementation(implementation, newMicLabel);
            }
            else if (this.selectedImplementation) {
                this.clearSelectedImplementation(changeReason);
            }
        }
        else {
            this.clearSelectedImplementation(changeReason);
        }
    }
    changeImplementation(implementation, deviceLabel, options) {
        return __awaiter(this, void 0, void 0, function* () {
            if (implementation === this.selectedImplementation) {
                return;
            }
            const transitionGeneration = ++this.implementationTransitionGeneration;
            const previousImplementation = this.selectedImplementation;
            if (previousImplementation) {
                // remove headsetStates associated with implementation
                this.headsetConversationStates = {};
                yield previousImplementation.disconnect();
                if (transitionGeneration !== this.implementationTransitionGeneration) {
                    return;
                }
            }
            this.selectedImplementation = implementation;
            this._headsetEvents$.next({ event: HeadsetEvents.implementationChanged, payload: implementation });
            if (implementation) {
                yield implementation.connect(deviceLabel, options);
                if (transitionGeneration !== this.implementationTransitionGeneration &&
                    this.selectedImplementation !== implementation) {
                    yield implementation.disconnect();
                }
            }
        });
    }
    incomingCall(callInfo, hasOtherActiveCalls) {
        return __awaiter(this, void 0, void 0, function* () {
            const implementation = this.getConnectedImpl();
            if (!implementation) {
                return;
            }
            this.headsetConversationStates[callInfo.conversationId] = {
                conversationId: callInfo.conversationId,
                held: false,
                muted: false,
                offHook: false,
                ringing: true
            };
            return implementation.incomingCall(callInfo, hasOtherActiveCalls);
        });
    }
    outgoingCall(callInfo) {
        return __awaiter(this, void 0, void 0, function* () {
            const implementation = this.getConnectedImpl();
            if (!implementation) {
                return;
            }
            this.headsetConversationStates[callInfo.conversationId] = {
                conversationId: callInfo.conversationId,
                held: false,
                muted: false,
                offHook: true,
                ringing: false
            };
            return implementation.outgoingCall(callInfo);
        });
    }
    answerCall(conversationId, autoAnswer) {
        return __awaiter(this, void 0, void 0, function* () {
            const implementation = this.getConnectedImpl();
            if (!implementation) {
                return;
            }
            if (!autoAnswer) {
                const expectedStatePostAction = {
                    ringing: false,
                    offHook: true
                };
                if (this.updateHeadsetState({ conversationId, state: expectedStatePostAction })) {
                    return implementation.answerCall(conversationId);
                }
            }
            else {
                this.headsetConversationStates[conversationId] = {
                    conversationId: conversationId,
                    held: false,
                    muted: false,
                    offHook: true,
                    ringing: false
                };
                return implementation.answerCall(conversationId, autoAnswer);
            }
        });
    }
    rejectCall(conversationId, expectExistingConversation = true) {
        return __awaiter(this, void 0, void 0, function* () {
            const implementation = this.getConnectedImpl();
            if (!implementation) {
                return;
            }
            const expectedStatePostAction = {
                ringing: false
            };
            if (this.updateHeadsetState({ conversationId, state: expectedStatePostAction }, { expectExistingConversation })) {
                const headsetState = this.headsetConversationStates[conversationId];
                headsetState.removeTimer = this.setRemoveTimer(conversationId);
                return implementation.rejectCall(conversationId);
            }
        });
    }
    setMute(value) {
        return __awaiter(this, void 0, void 0, function* () {
            const implementation = this.getConnectedImpl();
            if (!implementation) {
                return;
            }
            if (Object.values(this.headsetConversationStates).some(headsetState => headsetState.muted !== value)) {
                Object.values(this.headsetConversationStates).forEach(headsetState => headsetState.muted = value);
                return implementation.setMute(value);
            }
        });
    }
    setHold(conversationId, value) {
        return __awaiter(this, void 0, void 0, function* () {
            const implementation = this.getConnectedImpl();
            if (!implementation) {
                return;
            }
            const expectedStatePostAction = {
                held: value
            };
            if (this.updateHeadsetState({ conversationId, state: expectedStatePostAction })) {
                return implementation.setHold(conversationId, value);
            }
        });
    }
    endCall(conversationId, hasOtherActiveCalls) {
        return __awaiter(this, void 0, void 0, function* () {
            const implementation = this.getConnectedImpl();
            if (!implementation) {
                return;
            }
            const expectedStatePostAction = {
                offHook: false
            };
            if (this.updateHeadsetState({ conversationId, state: expectedStatePostAction })) {
                const headsetState = this.headsetConversationStates[conversationId];
                headsetState.removeTimer = this.setRemoveTimer(conversationId);
                return implementation.endCall(conversationId, hasOtherActiveCalls);
            }
        });
    }
    endAllCalls() {
        return __awaiter(this, void 0, void 0, function* () {
            const implementation = this.getConnectedImpl();
            if (!implementation) {
                return;
            }
            Object.values(this.headsetConversationStates).forEach((headsetState) => {
                if (!headsetState.removeTimer) {
                    headsetState.removeTimer = this.setRemoveTimer(headsetState.conversationId);
                }
            });
            return implementation.endAllCalls();
        });
    }
    retryConnection(micLabel, options) {
        if (!this.selectedImplementation) {
            return Promise.reject(new Error('No active headset implementation'));
        }
        return this.selectedImplementation.connect(micLabel, options);
    }
    connectionStatus() {
        if (this.selectedImplementation) {
            if (!this.selectedImplementation.isConnected && !this.selectedImplementation.isConnecting) {
                return 'notRunning';
            }
            return this.selectedImplementation.isConnected ? 'running' : 'checking';
        }
        return 'noVendor';
    }
    resetHeadsetStateForCall(conversationId) {
        const implementation = this.getConnectedImpl();
        if (implementation) {
            return implementation.resetHeadsetStateForCall(conversationId);
        }
        else {
            this.logger.info('No active implementation, headset state does not require a reset');
        }
    }
    getConnectedImpl() {
        const impl = this.selectedImplementation;
        if (!impl || !impl.isConnected) {
            return null;
        }
        return impl;
    }
    subscribeToHeadsetEvents(implementation) {
        implementation.on(HeadsetEvents.deviceAnsweredCall, this.handleDeviceAnsweredCall.bind(this));
        implementation.on(HeadsetEvents.deviceRejectedCall, this.handleDeviceRejectedCall.bind(this));
        implementation.on(HeadsetEvents.deviceEndedCall, this.handleDeviceEndedCall.bind(this));
        implementation.on(HeadsetEvents.deviceMuteStatusChanged, this.handleDeviceMuteStatusChanged.bind(this));
        implementation.on(HeadsetEvents.deviceHoldStatusChanged, this.handleDeviceHoldStatusChanged.bind(this));
        implementation.on(HeadsetEvents.deviceEventLogs, this.handleDeviceLogs.bind(this));
        implementation.on(HeadsetEvents.deviceConnectionStatusChanged, this.handleDeviceConnectionStatusChanged.bind(this));
        implementation.on(HeadsetEvents.webHidPermissionRequested, this.handleWebHidPermissionRequested.bind(this));
    }
    clearSelectedImplementation(clearReason) {
        this.implementationTransitionGeneration++;
        if (!this.selectedImplementation) {
            return;
        }
        this.selectedImplementation.disconnect(clearReason);
        this._headsetEvents$.next({ event: HeadsetEvents.implementationChanged, payload: null });
        this.selectedImplementation = null;
        this.publishConnectionStatus();
    }
    setRemoveTimer(conversationId) {
        return setTimeout(() => {
            // we are using the removeTimer to make sure this is actually slated for removal.
            // if we get a new incoming call for example, it will replace the current state which is slated for
            // removal and we don't want to remove it if it's a new/updated state
            if (this.headsetConversationStates[conversationId].removeTimer) {
                delete this.headsetConversationStates[conversationId];
            }
        }, REMOVE_WAIT);
    }
    handleDeviceAnsweredCall(event) {
        if (!this.isEventFromSelectedImplementation(event)) {
            return;
        }
        const expectedStatePostAction = {
            ringing: false,
            offHook: true
        };
        this.updateHeadsetState({ conversationId: event.body.conversationId, state: expectedStatePostAction });
        this.logger.info('Headset: device answered the call');
        this._headsetEvents$.next({ event: HeadsetEvents.deviceAnsweredCall, payload: Object.assign({}, event.body) });
    }
    handleDeviceRejectedCall(event) {
        if (!this.isEventFromSelectedImplementation(event)) {
            return;
        }
        const expectedStatePostAction = {
            ringing: false
        };
        const conversationId = event.body.conversationId;
        if (this.updateHeadsetState({ conversationId, state: expectedStatePostAction })) {
            const headsetState = this.headsetConversationStates[conversationId];
            headsetState.removeTimer = this.setRemoveTimer(conversationId);
        }
        this.logger.info('Headset: device rejected the call');
        this._headsetEvents$.next({ event: HeadsetEvents.deviceRejectedCall, payload: Object.assign({}, event.body) });
    }
    handleDeviceEndedCall(event) {
        if (!this.isEventFromSelectedImplementation(event)) {
            return;
        }
        this.logger.info('Headset: device ended the call');
        const expectedStatePostAction = {
            offHook: false
        };
        const conversationId = event.body.conversationId;
        if (this.updateHeadsetState({ conversationId, state: expectedStatePostAction })) {
            const headsetState = this.headsetConversationStates[conversationId];
            headsetState.removeTimer = this.setRemoveTimer(conversationId);
        }
        this._headsetEvents$.next({ event: HeadsetEvents.deviceEndedCall, payload: Object.assign({}, event.body) });
    }
    handleDeviceMuteStatusChanged(event) {
        if (!this.isEventFromSelectedImplementation(event)) {
            return;
        }
        this.logger.info('Headset: device mute status changed: ', event.body.isMuted);
        if (Object.values(this.headsetConversationStates).some(headsetState => headsetState.muted !== event.body.isMuted)) {
            Object.values(this.headsetConversationStates).forEach(headsetState => headsetState.muted = event.body.isMuted);
        }
        this._headsetEvents$.next({ event: HeadsetEvents.deviceMuteStatusChanged, payload: Object.assign({}, event.body) });
    }
    handleDeviceHoldStatusChanged(event) {
        if (!this.isEventFromSelectedImplementation(event)) {
            return;
        }
        this.logger.info('Headset: device hold status changed', event.body.holdRequested);
        const expectedStatePostAction = {
            held: event.body.holdRequested
        };
        const conversationId = event.body.conversationId;
        this.updateHeadsetState({ conversationId, state: expectedStatePostAction });
        this._headsetEvents$.next({ event: HeadsetEvents.deviceHoldStatusChanged, payload: Object.assign({}, event.body) });
    }
    handleDeviceConnectionStatusChanged(event) {
        if (!this.isEventFromSelectedImplementation(event)) {
            return;
        }
        this.publishConnectionStatus();
    }
    publishConnectionStatus() {
        this._headsetEvents$.next({ event: HeadsetEvents.deviceConnectionStatusChanged, payload: this.connectionStatus() });
    }
    handleWebHidPermissionRequested(event) {
        if (!this.isEventFromSelectedImplementation(event)) {
            return;
        }
        this.logger.debug('Requesting Webhid Permissions');
        this._headsetEvents$.next({ event: HeadsetEvents.webHidPermissionRequested, payload: Object.assign({}, event.body) });
    }
    /* This function has no functional purpose in a real life example
     * It is here to help log all events in the call process at least for Plantronics
     */
    handleDeviceLogs(eventInfo) {
        if (!this.isEventFromSelectedImplementation(eventInfo)) {
            return;
        }
        this._headsetEvents$.next({ event: HeadsetEvents.loggableEvent, payload: Object.assign({}, eventInfo.body) });
    }
    isEventFromSelectedImplementation(event) {
        return event.vendor === this.selectedImplementation;
    }
}
//# sourceMappingURL=headset.js.map