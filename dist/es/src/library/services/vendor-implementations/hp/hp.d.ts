import { VendorImplementation, ImplementationConfig } from '../vendor-implementation';
import DeviceInfo from '../../../types/device-info';
import { CallInfo } from '../../../types/call-info';
import { UpdateReasons } from '../../../types/headset-states';
import CcSdk, { SdkEvent } from '@hp/call-control-sdk';
declare global {
    type BluetoothDevice = any;
}
export default class HpService extends VendorImplementation {
    private static instance;
    vendorName: string;
    pluginName: string;
    config: ImplementationConfig;
    pendingDeviceLabel: string | null;
    connectionTimer: any;
    callControlSdk: CcSdk;
    ccsdkRegistered: boolean;
    incomingConversationId: string;
    activeConversationIds: Array<string>;
    heldConversationIds: Array<string>;
    _deviceInfo: DeviceInfo;
    _device: any;
    private constructor();
    isSupported(): boolean;
    deviceLabelMatchesVendor(label: string): boolean;
    static getInstance(config: ImplementationConfig): HpService;
    get deviceName(): string | undefined;
    get deviceInfo(): DeviceInfo;
    get isDeviceAttached(): boolean;
    sdkEventHandler(sdkEvent: SdkEvent): Promise<any>;
    connect(originalDeviceLabel: string): Promise<any>;
    getPreviouslyConnectedDevice(deviceLabel: string): Promise<any>;
    webHidPairing(): Promise<any>;
    getDeviceFromWebhid(): Promise<any>;
    disconnect(clearReason?: UpdateReasons): Promise<any>;
    updateCcsdkCallState(): Promise<void>;
    removeConversationId(conversationId: string): void;
    incomingCall(callInfo: CallInfo): Promise<void>;
    outgoingCall(callInfo: CallInfo): Promise<any>;
    answerCall(conversationId: string, autoAnswer?: boolean): Promise<any>;
    rejectCall(conversationId: string): Promise<any>;
    endCall(conversationId: string): Promise<any>;
    endAllCalls(): Promise<void>;
    setMute(value: boolean): Promise<any>;
    setHold(conversationId: string, value: boolean): Promise<any>;
}
