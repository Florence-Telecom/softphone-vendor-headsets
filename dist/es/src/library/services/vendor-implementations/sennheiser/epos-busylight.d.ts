export declare const EPOS_BUSYLIGHT_VENDOR_ID = 5013;
export declare const EPOS_BUSYLIGHT_PRODUCT_ID = 116;
export declare const BUSYLIGHT_BLINK_INTERVAL_MS = 500;
export interface BusylightColor {
    red: number;
    green: number;
    blue: number;
}
export type BusylightPhase = 'idle' | 'ringing' | 'busy' | 'held';
export interface BusylightColorScheme {
    ringing: BusylightColor;
    busy: BusylightColor;
    held: BusylightColor;
}
export declare const DEFAULT_BUSYLIGHT_COLORS: BusylightColorScheme;
interface EposHidReportItem {
    reportSize?: number;
    reportCount?: number;
}
interface EposHidReport {
    reportId: number;
    items?: EposHidReportItem[];
}
interface EposHidCollection {
    outputReports?: EposHidReport[];
}
export interface EposHidDevice {
    opened: boolean;
    vendorId: number;
    productId: number;
    collections: EposHidCollection[];
    open(): Promise<void>;
    close(): Promise<void>;
    sendReport(reportId: number, data: BufferSource): Promise<void>;
}
export declare class EposBusylightController {
    private device;
    private ledReportLength;
    private ringerReportLength;
    private blinkHandle;
    private currentPhase;
    static isSupported(): boolean;
    /** Must be called synchronously from a user-gesture handler (WebHID requirement). */
    static requestDevice(): Promise<EposHidDevice | undefined>;
    /** Devices already granted in a previous session; safe to call without a user gesture. */
    static findGrantedDevice(): Promise<EposHidDevice | undefined>;
    get isConnected(): boolean;
    connect(device: EposHidDevice): Promise<void>;
    disconnect(): Promise<void>;
    private stopBlink;
    private sendColor;
    /** Solid color for busy/held, blinking for ringing, off for idle. Best-effort. */
    setPhase(phase: BusylightPhase, colors?: BusylightColorScheme): Promise<void>;
    get phase(): BusylightPhase;
    ring(): Promise<void>;
}
export {};
