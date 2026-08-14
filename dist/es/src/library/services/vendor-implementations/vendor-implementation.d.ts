import DeviceInfo from '../../types/device-info';
import StrictEventEmitter from 'strict-event-emitter-types';
import { EventEmitter } from 'events';
import { EmittedHeadsetEvents, EventInfo, EventInfoWithConversationId, HoldEventInfo, MutedEventInfo } from '../../types/emitted-headset-events';
import { CallInfo } from '../..';
import { UpdateReasons } from '../../types/headset-states';
export interface ImplementationConfig {
    logger: any;
    vendorName?: string;
    appName?: string;
    createNew?: boolean;
}
declare const VendorImplementation_base: new () => StrictEventEmitter<EventEmitter, EmittedHeadsetEvents>;
export declare abstract class VendorImplementation extends VendorImplementation_base {
    vendorName: string;
    isConnecting: boolean;
    isConnected: boolean;
    isMuted: boolean;
    errorCode: string;
    disableRetry: boolean;
    logger: any;
    config: ImplementationConfig;
    constructor(config: ImplementationConfig);
    get isDeviceAttached(): boolean;
    isSupported(): boolean;
    abstract get deviceInfo(): DeviceInfo;
    deviceLabelMatchesVendor(label: string): boolean;
    connect(selectedMicLabel?: string): Promise<any>;
    disconnect(clearReason?: UpdateReasons): Promise<any>;
    incomingCall(callInfo: CallInfo, hasOtherActiveCalls?: boolean): Promise<any>;
    outgoingCall(callInfo: CallInfo): Promise<any>;
    answerCall(conversationId: string, autoAnswer?: boolean): Promise<any>;
    rejectCall(conversationId: string): Promise<any>;
    endCall(conversationId: string, hasOtherActiveCalls: boolean): Promise<any>;
    endAllCalls(): Promise<any>;
    setMute(value: boolean): Promise<any>;
    setHold(conversationId: string, value: boolean): Promise<any>;
    resetHeadsetStateForCall(conversationId?: string): Promise<any>;
    private emitEvent;
    requestWebHidPermissions(callback: any): void;
    deviceAnsweredCall(eventInfo: EventInfoWithConversationId): void;
    deviceRejectedCall(eventInfo: EventInfoWithConversationId): void;
    deviceEndedCall(eventInfo: EventInfoWithConversationId): void;
    deviceMuteChanged(eventInfo: MutedEventInfo): void;
    deviceHoldStatusChanged(eventInfo: HoldEventInfo): void;
    deviceEventLogs(eventInfo: EventInfo): void;
    changeConnectionStatus(headsetState: {
        isConnected: boolean;
        isConnecting: boolean;
    }): void;
    /**
     * Try to deduct the product id based on the label.
     * Making the assumption that the label will end with (vendorid:productid).
     *
     * @param selectedMicLabel
     * @returns The product id if matched or null.
     */
    deductProductId(selectedMicLabel: string): number;
}
export {};
