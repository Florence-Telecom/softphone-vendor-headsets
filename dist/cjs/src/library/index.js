"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_BUSYLIGHT_COLORS = exports.EPOS_BUSYLIGHT_PRODUCT_ID = exports.EPOS_BUSYLIGHT_VENDOR_ID = exports.EposBusylightController = exports.VendorImplementation = void 0;
const headset_1 = __importDefault(require("./services/headset"));
const vendor_implementation_1 = require("./services/vendor-implementations/vendor-implementation");
Object.defineProperty(exports, "VendorImplementation", { enumerable: true, get: function () { return vendor_implementation_1.VendorImplementation; } });
__exportStar(require("./types/call-info"), exports);
__exportStar(require("./types/consumed-headset-events"), exports);
__exportStar(require("./types/device-info"), exports);
__exportStar(require("./types/emitted-headset-events"), exports);
__exportStar(require("./types/headset-states"), exports);
var epos_busylight_1 = require("./services/vendor-implementations/sennheiser/epos-busylight");
Object.defineProperty(exports, "EposBusylightController", { enumerable: true, get: function () { return epos_busylight_1.EposBusylightController; } });
Object.defineProperty(exports, "EPOS_BUSYLIGHT_VENDOR_ID", { enumerable: true, get: function () { return epos_busylight_1.EPOS_BUSYLIGHT_VENDOR_ID; } });
Object.defineProperty(exports, "EPOS_BUSYLIGHT_PRODUCT_ID", { enumerable: true, get: function () { return epos_busylight_1.EPOS_BUSYLIGHT_PRODUCT_ID; } });
Object.defineProperty(exports, "DEFAULT_BUSYLIGHT_COLORS", { enumerable: true, get: function () { return epos_busylight_1.DEFAULT_BUSYLIGHT_COLORS; } });
exports.default = headset_1.default;
//# sourceMappingURL=index.js.map