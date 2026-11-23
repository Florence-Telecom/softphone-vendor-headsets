export default interface DeviceInfo {
    ProductName?: string;
    deviceName?: string;
    deviceId?: string;
    deviceID?: string;
    headsetType?: string;
    attached?: boolean;
}
export interface PartialHIDDevice {
    productName: string;
    collections: PartialDeviceCollections[];
}
interface PartialDeviceCollections {
    usage: number;
    usagePage: number;
    inputReports: PartialInputReports[];
    outputReports: PartialInputReports[];
}
interface PartialInputReports {
    reportId: number;
}
export {};
