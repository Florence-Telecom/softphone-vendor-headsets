/* istanbul ignore file */
import { EventEmitter } from 'events';
import { isCefHosted } from './library/utils';
export default function () {
    if (!window._HostedContextFunctions) {
        return;
    }
    return new HostedContext();
}
class HostedContext extends EventEmitter {
    constructor() {
        super();
        const assetURL = window.location.origin + window.location.pathname;
        const initData = {
            assetURL,
            callback: this.cefCallback.bind(this),
            supportsTerminationRequest: true,
            supportsUnifiedPreferences: true,
        };
        if (isCefHosted()) {
            const appInfo = window._HostedContextFunctions.register(initData);
            this._supportsJabra = appInfo.supportsJabra;
            this._supportsWebHid = appInfo.supportsWebHID;
            this._isHosted = true;
        }
    }
    supportsJabra() {
        return !!this._supportsJabra;
    }
    supportsWebHid() {
        return !!this._supportsWebHid;
    }
    isHosted() {
        return !!this._isHosted;
    }
    cefCallback(obj) {
        const msg = obj.msg;
        if (msg === 'JabraEvent') {
            const eventName = obj.event; //Mute, Hold, OffHook, ...
            const value = obj.value; //true or false
            const hidInput = obj.hidInput; //Raw int value of input, useful if eventName is not recognized.
            console.debug('Jabra event received: id: ' + hidInput + ' name:' + eventName + ' value: ' + value);
            this.emit('JabraEvent', { eventName, value, hidInput });
        }
        else if (msg === 'JabraDeviceAttached') {
            const attached = obj.attached; //true if attached, false if detached
            const deviceName = obj.deviceName; //Name of device when attached, empty string when detached
            const deviceId = obj.deviceId; //ID of device
            console.debug('Jabra device-attached received: id: ' +
                deviceId +
                ' name:' +
                deviceName +
                ' attached: ' +
                attached);
            this.emit('JabraDeviceAttached', { deviceName, deviceId, attached });
        }
    }
    sendEventToDesktop(event, data) {
        window._HostedContextFunctions.sendEventToDesktop(event, {
            deviceID: data.deviceID,
            event: data.event,
            value: data.value
        });
    }
}
//# sourceMappingURL=decorate-cef-client.js.map