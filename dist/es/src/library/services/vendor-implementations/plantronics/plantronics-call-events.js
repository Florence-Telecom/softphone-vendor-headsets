export var PlantronicsCallEventCodes;
(function (PlantronicsCallEventCodes) {
    PlantronicsCallEventCodes[PlantronicsCallEventCodes["Unknown"] = 0] = "Unknown";
    PlantronicsCallEventCodes[PlantronicsCallEventCodes["AcceptCall"] = 1] = "AcceptCall";
    PlantronicsCallEventCodes[PlantronicsCallEventCodes["TerminateCall"] = 2] = "TerminateCall";
    PlantronicsCallEventCodes[PlantronicsCallEventCodes["HoldCall"] = 3] = "HoldCall";
    PlantronicsCallEventCodes[PlantronicsCallEventCodes["ResumeCall"] = 4] = "ResumeCall";
    PlantronicsCallEventCodes[PlantronicsCallEventCodes["Flash"] = 5] = "Flash";
    PlantronicsCallEventCodes[PlantronicsCallEventCodes["CallInProgress"] = 6] = "CallInProgress";
    PlantronicsCallEventCodes[PlantronicsCallEventCodes["CallRinging"] = 7] = "CallRinging";
    PlantronicsCallEventCodes[PlantronicsCallEventCodes["CallEnded"] = 8] = "CallEnded";
    PlantronicsCallEventCodes[PlantronicsCallEventCodes["TransferToHeadset"] = 9] = "TransferToHeadset";
    PlantronicsCallEventCodes[PlantronicsCallEventCodes["TransferToSpeaker"] = 10] = "TransferToSpeaker";
    PlantronicsCallEventCodes[PlantronicsCallEventCodes["Mute"] = 11] = "Mute";
    PlantronicsCallEventCodes[PlantronicsCallEventCodes["Unmute"] = 12] = "Unmute";
    PlantronicsCallEventCodes[PlantronicsCallEventCodes["MobileCallRinging"] = 13] = "MobileCallRinging";
    PlantronicsCallEventCodes[PlantronicsCallEventCodes["MobileCallInProgress"] = 14] = "MobileCallInProgress";
    PlantronicsCallEventCodes[PlantronicsCallEventCodes["MobileCallEnded"] = 15] = "MobileCallEnded";
    PlantronicsCallEventCodes[PlantronicsCallEventCodes["DOn"] = 16] = "DOn";
    PlantronicsCallEventCodes[PlantronicsCallEventCodes["DOff"] = 17] = "DOff";
    PlantronicsCallEventCodes[PlantronicsCallEventCodes["CallIdle"] = 18] = "CallIdle";
    PlantronicsCallEventCodes[PlantronicsCallEventCodes["Play"] = 19] = "Play";
    PlantronicsCallEventCodes[PlantronicsCallEventCodes["Pause"] = 20] = "Pause";
    PlantronicsCallEventCodes[PlantronicsCallEventCodes["Stop"] = 21] = "Stop";
    PlantronicsCallEventCodes[PlantronicsCallEventCodes["DTMLKey"] = 22] = "DTMLKey";
    PlantronicsCallEventCodes[PlantronicsCallEventCodes["RejectCall"] = 23] = "RejectCall";
    PlantronicsCallEventCodes[PlantronicsCallEventCodes["MakeCall"] = 24] = "MakeCall";
    PlantronicsCallEventCodes[PlantronicsCallEventCodes["Hook"] = 25] = "Hook";
    PlantronicsCallEventCodes[PlantronicsCallEventCodes["HookIdle"] = 26] = "HookIdle";
    PlantronicsCallEventCodes[PlantronicsCallEventCodes["HookDocked"] = 27] = "HookDocked";
    PlantronicsCallEventCodes[PlantronicsCallEventCodes["HookUndocked"] = 28] = "HookUndocked";
    PlantronicsCallEventCodes[PlantronicsCallEventCodes["BaseEvent"] = 29] = "BaseEvent";
    PlantronicsCallEventCodes[PlantronicsCallEventCodes["CallAnsweredAndEnded"] = 30] = "CallAnsweredAndEnded";
    PlantronicsCallEventCodes[PlantronicsCallEventCodes["CallUnansweredAndEnded"] = 31] = "CallUnansweredAndEnded";
    PlantronicsCallEventCodes[PlantronicsCallEventCodes["DeviceChange"] = 32] = "DeviceChange";
    PlantronicsCallEventCodes[PlantronicsCallEventCodes["DeviceArrived"] = 33] = "DeviceArrived";
    PlantronicsCallEventCodes[PlantronicsCallEventCodes["DeviceRemoved"] = 34] = "DeviceRemoved";
})(PlantronicsCallEventCodes || (PlantronicsCallEventCodes = {}));
// Don't need this, because CallEvents[code] will return the name
// const reverseCallEvents: Dictionary;
// for (const eventName of Object.keys(CallEvents)) {
//   const code = CallEvents[eventName];
//   reverseCallEvents[code] = eventName;
// }
// export function getEventName (code) {
//   return reverseCallEvents[code];
// }
//# sourceMappingURL=plantronics-call-events.js.map