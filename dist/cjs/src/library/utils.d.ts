export declare function isFirefox(): boolean;
/**
 *
 * @param promise
 * @param timeoutInMillis
 *
 * Returns a promise that resolves if the passed in promise resolves before the timeout
 * time elapses.  If the timeout elapses, then the returned promise rejects with a
 * message that the timeout time was exceeded.
 */
export declare function timedPromise(promise: Promise<any>, timeoutInMillis: number, timeoutError?: Error): Promise<any>;
export declare function debounce(func: () => void, delay: number): any;
export declare function isCefHosted(): boolean;
export declare function requestCefPromise(cmd: any): Promise<any>;
