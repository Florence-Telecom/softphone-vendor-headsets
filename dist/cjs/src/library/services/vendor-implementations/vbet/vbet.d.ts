import { VendorImplementation, ImplementationConfig } from '../vendor-implementation';
import { CallInfo } from '../../..';
import DeviceInfo from '../../../types/device-info';
import { DeviceSignalType } from '@vbet/webhid-sdk';
export default class VBetService extends VendorImplementation {
    private static instance;
    private activeConversationId;
    private pendingConversationId;
    private _deviceInfo;
    private activeDevice;
    vendorName: string;
    static getInstance(config: ImplementationConfig): VBetService;
    get deviceInfo(): DeviceInfo;
    isSupported(): boolean;
    deviceLabelMatchesVendor(label: string): boolean;
    connect(originalDeviceLabel: string): Promise<void>;
    processBtnPress: (signal: DeviceSignalType) => void;
    disconnect(): Promise<void>;
    incomingCall(callInfo: CallInfo): Promise<void>;
    outgoingCall(callInfo: CallInfo): Promise<void>;
    answerCall(conversationId: string, autoAnswer?: boolean): Promise<void>;
    rejectCall(conversationId: string): Promise<void>;
    endCall(conversationId: string): Promise<void>;
    endAllCalls(): Promise<void>;
    setMute(value: boolean): Promise<void>;
}
