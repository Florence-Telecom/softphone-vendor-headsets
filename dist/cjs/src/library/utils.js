"use strict";
/* istanbul ignore file */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isFirefox = isFirefox;
exports.timedPromise = timedPromise;
exports.debounce = debounce;
exports.checkWebHidSupport = checkWebHidSupport;
exports.isCefHosted = isCefHosted;
exports.requestCefPromise = requestCefPromise;
const browserama_1 = __importDefault(require("browserama"));
function isFirefox() {
    return browserama_1.default.isFireFox;
}
/**
 *
 * @param promise
 * @param timeoutInMillis
 *
 * Returns a promise that resolves if the passed in promise resolves before the timeout
 * time elapses.  If the timeout elapses, then the returned promise rejects with a
 * message that the timeout time was exceeded.
 */
function timedPromise(promise, timeoutInMillis, timeoutError) {
    let timeoutId;
    const timeoutPromise = new Promise((resolve, reject) => {
        timeoutId = setTimeout(() => {
            clearTimeout(timeoutId);
            reject(timeoutError ? timeoutError : 'Timed out in ' + timeoutInMillis + 'ms');
        }, timeoutInMillis);
    }).then(result => {
        clearTimeout(timeoutId);
        return result;
    });
    return Promise.race([promise, timeoutPromise]);
}
function debounce(func, delay) {
    let timer = null;
    return function () {
        clearTimeout(timer);
        timer = setTimeout(function () {
            func();
        }, delay);
    };
}
function checkWebHidSupport(config, vendor) {
    const featureToggleForVendor = Object.keys(config).find(key => {
        return key.toLowerCase().includes(vendor);
    });
    if (isCefHosted()) {
        if (config[featureToggleForVendor]) {
            return config.hostedContext.supportsWebHid();
        }
    }
    else {
        return !!window.navigator.hid;
    }
}
function isCefHosted() {
    return !!window._HostedContextFunctions;
}
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
function requestCefPromise(cmd) {
    /* eslint-enable */
    return new Promise((resolve, reject) => {
        try {
            const sCmd = JSON.stringify(cmd);
            window.cefQuery({
                request: sCmd,
                persistent: false,
                onSuccess: response => {
                    try {
                        const obj = JSON.parse(response);
                        resolve(obj);
                    }
                    catch (e) {
                        resolve({});
                    }
                },
                onFailure: response => {
                    reject(response);
                }
            });
        }
        catch (e) {
            console.error('Error requesting desktop promise', e);
            reject(e);
        }
    });
}
//# sourceMappingURL=utils.js.map