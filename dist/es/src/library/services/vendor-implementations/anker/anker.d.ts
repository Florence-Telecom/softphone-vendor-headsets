import { VendorImplementation, ImplementationConfig } from '../vendor-implementation';
import { CallInfo } from '../../..';
import DeviceInfo from '../../../types/device-info';
import { PartialInputReportEvent } from '../../../types/consumed-headset-events';
export declare const ANKER_VENDOR_ID = 10522;
type CallState = 'idle' | 'ringing' | 'active';
export default class AnkerService extends VendorImplementation {
    private static instance;
    vendorName: string;
    activeDevice: any;
    private _deviceInfo;
    private callState;
    private activeConversationId;
    private pendingConversationId;
    private isHeld;
    static getInstance(config: ImplementationConfig): AnkerService;
    get deviceInfo(): DeviceInfo;
    get isDeviceAttached(): boolean;
    get _callState(): CallState;
    isSupported(): boolean;
    deviceLabelMatchesVendor(label: string): boolean;
    connect(originalDeviceLabel: string): Promise<void>;
    /**
     * Picks the Anker device exposing the telephony collection. When several are granted,
     * prefer the one whose product name appears in the selected microphone label.
     */
    selectDevice(devices: any[], originalDeviceLabel?: string): any;
    disconnect(): Promise<void>;
    handleInputReport: (event: PartialInputReportEvent) => void;
    private handleCallButtonPress;
    private syncMuteFromDevice;
    incomingCall(callInfo: CallInfo): Promise<void>;
    outgoingCall(callInfo: CallInfo): Promise<void>;
    answerCall(conversationId: string): Promise<void>;
    rejectCall(conversationId: string): Promise<void>;
    endCall(conversationId: string, hasOtherActiveCalls?: boolean): Promise<void>;
    endAllCalls(): Promise<void>;
    setMute(value: boolean): Promise<void>;
    setHold(conversationId: string, value: boolean): Promise<void>;
    private markCallActive;
    private resetState;
    private syncLeds;
    private sendLed;
}
export {};
