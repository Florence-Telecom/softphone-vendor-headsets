import HeadsetService from './services/headset';
import { VendorImplementation } from './services/vendor-implementations/vendor-implementation';

export * from './types/call-info';
export * from './types/consumed-headset-events';
export * from './types/device-info';
export * from './types/emitted-headset-events';
export * from './types/headset-states';
export type { ImplementationConnectionOptions } from './services/vendor-implementations/vendor-implementation';
export { VendorImplementation };
export {
  EposBusylightController,
  EPOS_BUSYLIGHT_VENDOR_ID,
  EPOS_BUSYLIGHT_PRODUCT_ID,
  DEFAULT_BUSYLIGHT_COLORS,
} from './services/vendor-implementations/sennheiser/epos-busylight';
export type {
  BusylightPhase,
  BusylightColor,
  BusylightColorScheme,
  EposHidDevice,
} from './services/vendor-implementations/sennheiser/epos-busylight';
export default HeadsetService;
