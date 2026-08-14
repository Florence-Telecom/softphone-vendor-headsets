import fetchJsonp from 'fetch-jsonp';
import { VendorImplementation, ImplementationConfig } from '../vendor-implementation';
import { PlantronicsCallEvent } from './plantronics-call-events';
import DeviceInfo from '../../../types/device-info';
import { CallInfo } from '../../../types/call-info';
import { UpdateReasons } from '../../../types/headset-states';
/**
 * TODO:  This looks like a feasible way to implement the polling we need
 *        https://makeitnew.io/polling-using-rxjs-8347d05e9104
 *  */
export default class PlantronicsService extends VendorImplementation {
    private static instance;
    activePollingInterval: number;
    connectedDeviceInterval: number;
    disconnectedDeviceInterval: number;
    deviceIdRetryInterval: number;
    vendorName: string;
    pluginName: string;
    apiHost: string;
    isActive: boolean;
    disableEventPolling: boolean;
    config: ImplementationConfig;
    deviceStatusTimer: any;
    isRetry: boolean;
    _deviceInfo: DeviceInfo;
    callEventsTimerId: any;
    deviceStatusTimerId: any;
    incomingConversationId: string;
    callMappings: {
        [callIdOrConversationId in string | number]: string | number;
    };
    private constructor();
    private _createCallMapping;
    clearTimeouts(): void;
    deviceLabelMatchesVendor(label: string): boolean;
    static getInstance(config: ImplementationConfig): PlantronicsService;
    get deviceName(): string | undefined;
    get deviceInfo(): DeviceInfo;
    get isDeviceAttached(): boolean;
    pollForCallEvents(): void;
    pollForDeviceStatus(): void;
    _makeRequestTask(endpoint: string, isRetry?: boolean): Promise<any>;
    _fetch(url: string): Promise<fetchJsonp.Response>;
    _makeRequest(endpoint: string, isRetry: boolean | undefined): Promise<any>;
    _checkIsActiveTask(): Promise<void>;
    _getActiveCalls(): Promise<any[]>;
    getCallEvents(): Promise<any>;
    getDeviceStatus(): Promise<void>;
    callCorrespondingFunction(eventInfo: {
        name: string;
        event?: PlantronicsCallEvent;
    }): void;
    unregisterPlugin(): Promise<any>;
    connect(): Promise<any>;
    disconnect(clearReason?: UpdateReasons): Promise<any>;
    incomingCall(callInfo: CallInfo): Promise<any>;
    outgoingCall({ conversationId, contactName }: CallInfo): Promise<any>;
    answerCall(conversationId: string, autoAnswer?: boolean): Promise<any>;
    rejectCall(conversationId: string): Promise<any>;
    endCall(conversationId: string): Promise<any>;
    endAllCalls(): Promise<void>;
    setMute(value: boolean): Promise<any>;
    setHold(conversationId: string, value: boolean): Promise<any>;
}
