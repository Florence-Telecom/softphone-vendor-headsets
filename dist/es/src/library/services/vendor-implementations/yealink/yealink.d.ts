import { VendorImplementation, ImplementationConfig, ImplementationConnectionOptions } from "../vendor-implementation";
import { CallInfo } from '../../..';
import DeviceInfo from "../../../types/device-info";
export default class YealinkService extends VendorImplementation {
    private static instance;
    private pendingConversationId;
    private activeConversationId;
    private _deviceInfo;
    private activeDevice;
    private callState;
    private recCallState;
    private isHold;
    private inputReportReportId;
    vendorName: string;
    static getInstance(config: ImplementationConfig): YealinkService;
    get deviceInfo(): DeviceInfo;
    isSupported(): boolean;
    deviceLabelMatchesVendor(label: string): boolean;
    connect(originalDeviceLabel?: string, options?: ImplementationConnectionOptions): Promise<void>;
    disconnect(): Promise<void>;
    processBtnPress(value: number): void;
    incomingCall(callInfo: CallInfo): Promise<void>;
    outgoingCall(callInfo: CallInfo): Promise<void>;
    answerCall(): Promise<void>;
    rejectCall(): Promise<void>;
    endCall(conversationId: string, hasOtherActiveCalls: boolean): Promise<void>;
    endAllCalls(): Promise<void>;
    setMute(value: boolean): Promise<void>;
    setHold(conversationId: string, value: boolean): Promise<void>;
    /**
     * Different Yealink models advertise their telephony HID reports at different
     * levels of the descriptor hierarchy. Some expose input reports directly on the
     * top-level telephony collection (usage 5 / usagePage 11), while others — like
     * the UH38 — nest them inside a child collection. This method walks the
     * descriptor to find the actual report ID the device uses, so we don't have to
     * hardcode a value that only works for some models.
     */
    private resolveReportId;
    sendOpToDevice(value: number): Promise<void>;
}
