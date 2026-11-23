"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SennheiserEventTypes = exports.SennheiserEvents = void 0;
var SennheiserEvents;
(function (SennheiserEvents) {
    SennheiserEvents["SocketConnected"] = "SocketConnected";
    SennheiserEvents["EstablishConnection"] = "EstablishConnection";
    SennheiserEvents["SPLogin"] = "SPLoggedIn";
    SennheiserEvents["SPLogout"] = "SPLoggedOut";
    SennheiserEvents["TerminateConnection"] = "TerminateConnection";
    SennheiserEvents["IncomingCall"] = "IncomingCall";
    SennheiserEvents["IncomingCallRejected"] = "InCallRejected";
    SennheiserEvents["IncomingCallAccepted"] = "InCallAccepted";
    SennheiserEvents["OutgoingCall"] = "OutgoingCall";
    SennheiserEvents["CallEnded"] = "CallEnded";
    SennheiserEvents["SystemInformation"] = "SystemInformation";
    SennheiserEvents["HeadsetConnected"] = "HeadsetConnected";
    SennheiserEvents["HeadsetDisconnected"] = "HeadsetDisconnected";
    SennheiserEvents["Hold"] = "CallHold";
    SennheiserEvents["Resume"] = "HeldCallResumed";
    SennheiserEvents["MuteFromApp"] = "MuteHeadset";
    SennheiserEvents["UnmuteFromApp"] = "UnmuteHeadset";
    SennheiserEvents["MuteFromHeadset"] = "MuteSoftphone";
    SennheiserEvents["UnmuteFromHeadset"] = "UnmuteSoftphone";
})(SennheiserEvents = exports.SennheiserEvents || (exports.SennheiserEvents = {}));
var SennheiserEventTypes;
(function (SennheiserEventTypes) {
    SennheiserEventTypes["Request"] = "Request";
    SennheiserEventTypes["Notification"] = "Notification";
    SennheiserEventTypes["Ack"] = "Acknowledgement";
})(SennheiserEventTypes = exports.SennheiserEventTypes || (exports.SennheiserEventTypes = {}));
//# sourceMappingURL=types.js.map