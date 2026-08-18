import { VendorImplementation } from "../services/vendor-implementations/vendor-implementation";
export interface EmittedHeadsetEvents {
    deviceAnsweredCall: VendorEvent<EventInfoWithConversationId>;
    deviceRejectedCall: VendorEvent<EventInfoWithConversationId>;
    deviceEndedCall: VendorEvent<EventInfoWithConversationId>;
    deviceMuteStatusChanged: VendorEvent<MutedEventInfo>;
    deviceHoldStatusChanged: VendorEvent<HoldEventInfo>;
    deviceEventLogs: VendorEvent<any>;
    webHidPermissionRequested: VendorEvent<WebHidPermissionRequest>;
    deviceConnectionStatusChanged: VendorEvent<any>;
    integrationStatusChanged: VendorEvent<HeadsetIntegrationStatus>;
}
export type VendorEvent<Type> = {
    vendor: VendorImplementation;
    body: Type;
};
export interface EventInfo {
    name: string;
    code?: string | number;
    event?: any;
    conversationId?: string;
}
export interface EventInfoWithConversationId extends EventInfo {
    conversationId: string;
}
export interface MutedEventInfo extends EventInfo {
    isMuted: boolean;
}
export interface HoldEventInfo extends EventInfoWithConversationId {
    holdRequested: boolean;
    toggle?: boolean;
}
export interface WebHidPermissionRequest {
    callback: any;
}
export type HeadsetTransportStatus = 'closed' | 'opening' | 'open';
export type HeadsetRegistrationStatus = 'none' | 'establishing' | 'established' | 'rejected';
export type HeadsetLoginStatus = 'loggedOut' | 'loggingIn' | 'loggedIn' | 'rejected';
export type HeadsetAttachmentStatus = 'unknown' | 'attached' | 'detached';
export interface HeadsetProtocolResult {
    event: string;
    outcome: 'success' | 'rejected' | 'timeout';
}
export interface HeadsetIntegrationStatus {
    transport: HeadsetTransportStatus;
    registration: HeadsetRegistrationStatus;
    login: HeadsetLoginStatus;
    headsetAttachment: HeadsetAttachmentStatus;
    headsetProductName?: string;
    systemInformationReceived: boolean;
    lastProtocolResult?: HeadsetProtocolResult;
}
