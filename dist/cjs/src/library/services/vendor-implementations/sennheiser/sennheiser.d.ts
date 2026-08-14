import { VendorImplementation, ImplementationConfig } from '../vendor-implementation';
import DeviceInfo from '../../../types/device-info';
import { CallInfo } from '../../..';
import { SennheiserPayload } from './types';
export default class SennheiserService extends VendorImplementation {
    private static instance;
    connectTimeout: number;
    vendorName: string;
    isActive: boolean;
    devices: any;
    activeDeviceId: any;
    websocketConnected: boolean;
    websocket: WebSocket;
    deviceInfo: DeviceInfo;
    ignoreAcknowledgement: boolean;
    private connectionGeneration;
    static getInstance(config: ImplementationConfig): SennheiserService;
    deviceLabelMatchesVendor(label: string): boolean;
    get deviceName(): string;
    get isDeviceAttached(): boolean;
    resetHeadsetStateForCall(conversationId: string): Promise<any>;
    _handleError(payload: SennheiserPayload): void;
    _handleAck(payload: SennheiserPayload): void;
    _sendMessage(payload: SennheiserPayload): void;
    _registerSoftphone(): void;
    connect(): Promise<void>;
    webSocketOnOpen: (socket?: WebSocket, generation?: number) => void;
    webSocketOnClose(err: {
        code: number;
        reason: string;
        wasClean: boolean;
    }, socket?: WebSocket, generation?: number): void;
    disconnect(): Promise<void>;
    setMute(value: boolean): Promise<void>;
    setHold(conversationId: string, value: boolean): Promise<void>;
    incomingCall(callInfo: CallInfo): Promise<void>;
    answerCall(conversationId: string, autoAnswer?: boolean): Promise<void>;
    rejectCall(conversationId: string): Promise<void>;
    outgoingCall(callInfo: CallInfo): Promise<void>;
    endCall(conversationId: string, hasOtherActiveCalls?: boolean): Promise<void>;
    endAllCalls(): Promise<void>;
    _handleMessage(message: {
        data: string;
    }, socket?: WebSocket, generation?: number): void;
    private ownsSocket;
    private retireSocket;
}
