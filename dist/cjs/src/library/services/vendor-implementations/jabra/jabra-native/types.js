"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JabraNativeEventNames = exports.DeviceEvent = exports.HeadsetEvent = exports.JabraNativeCommands = void 0;
var JabraNativeCommands;
(function (JabraNativeCommands) {
    JabraNativeCommands["Ring"] = "ringer";
    JabraNativeCommands["Offhook"] = "offhook";
    JabraNativeCommands["Mute"] = "mute";
    JabraNativeCommands["Hold"] = "hold";
})(JabraNativeCommands = exports.JabraNativeCommands || (exports.JabraNativeCommands = {}));
exports.HeadsetEvent = 'JabraEvent';
exports.DeviceEvent = 'JabraDeviceAttached';
var JabraNativeEventNames;
(function (JabraNativeEventNames) {
    JabraNativeEventNames["OffHook"] = "OffHook";
    JabraNativeEventNames["Mute"] = "Mute";
    JabraNativeEventNames["Hold"] = "Flash";
    JabraNativeEventNames["RejectCall"] = "RejectCall";
})(JabraNativeEventNames = exports.JabraNativeEventNames || (exports.JabraNativeEventNames = {}));
//# sourceMappingURL=types.js.map