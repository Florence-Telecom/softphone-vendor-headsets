export declare const EPOS_BUSYLIGHT_VENDOR_ID = 5013;
export declare const EPOS_BUSYLIGHT_PRODUCT_ID = 116;
export declare const BUSYLIGHT_BLINK_INTERVAL_MS = 500;
export declare const BUSYLIGHT_REASSERT_INTERVAL_MS = 2000;
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
    usagePage?: number;
    usage?: number;
    inputReports?: EposHidReport[];
    outputReports?: EposHidReport[];
    featureReports?: EposHidReport[];
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
export interface EposBusylightControllerOptions {
    /** Every failed write, including timer-driven blink and re-assert writes. */
    onWriteError?: (error: Error) => void;
    /** The first successful write after one or more failures. */
    onWriteRecovered?: () => void;
    reassertIntervalMs?: number;
}
export declare class EposBusylightController {
    private readonly options;
    private device;
    private framing;
    private timerHandle;
    private currentPhase;
    private writeQueue;
    private failing;
    constructor(options?: EposBusylightControllerOptions);
    static isSupported(): boolean;
    /**
     * WebHID can expose one physical device as several HIDDevice objects (one per HID
     * interface). Prefer the one that declares the LED output report instead of
     * whichever happens to be listed first.
     */
    static pickDevice(devices: EposHidDevice[]): EposHidDevice | undefined;
    /** Compact HID layout summary, safe to put in diagnostics. */
    static describeDevice(device: EposHidDevice): string;
    /** Must be called synchronously from a user-gesture handler (WebHID requirement). */
    static requestDevice(): Promise<EposHidDevice | undefined>;
    /** Devices already granted in a previous session; safe to call without a user gesture. */
    static findGrantedDevice(): Promise<EposHidDevice | undefined>;
    get isConnected(): boolean;
    get deviceSummary(): string | undefined;
    connect(device: EposHidDevice): Promise<void>;
    disconnect(): Promise<void>;
    private stopTimer;
    private write;
    private sendColor;
    private repeat;
    /** Blinking for ringing, solid (periodically re-sent) for busy/held, off for idle. */
    setPhase(phase: BusylightPhase, colors?: BusylightColorScheme): Promise<void>;
    get phase(): BusylightPhase;
    ring(): Promise<void>;
}
export {};
