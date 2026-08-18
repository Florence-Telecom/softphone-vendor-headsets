import {
  BUSYLIGHT_BLINK_INTERVAL_MS,
  EposBusylightController,
  EPOS_BUSYLIGHT_PRODUCT_ID,
  EPOS_BUSYLIGHT_VENDOR_ID,
  EposHidDevice,
} from './epos-busylight';

function createFakeDevice (overrides: Partial<EposHidDevice> = {}): EposHidDevice & { sendReport: jest.Mock } {
  return {
    opened: false,
    vendorId: EPOS_BUSYLIGHT_VENDOR_ID,
    productId: EPOS_BUSYLIGHT_PRODUCT_ID,
    collections: [],
    open: jest.fn(async function (this: EposHidDevice) { this.opened = true; }),
    close: jest.fn(async function (this: EposHidDevice) { this.opened = false; }),
    sendReport: jest.fn(async () => undefined),
    ...overrides,
  } as unknown as EposHidDevice & { sendReport: jest.Mock };
}

describe('EposBusylightController', () => {
  let originalHid: any;

  beforeEach(() => {
    originalHid = (global.navigator as any).hid;
  });

  afterEach(() => {
    (global.navigator as any).hid = originalHid;
    jest.useRealTimers();
  });

  describe('static device discovery', () => {
    it('isSupported reflects navigator.hid availability', () => {
      (global.navigator as any).hid = { requestDevice: jest.fn(), getDevices: jest.fn() };
      expect(EposBusylightController.isSupported()).toBe(true);

      delete (global.navigator as any).hid;
      expect(EposBusylightController.isSupported()).toBe(false);
    });

    it('requestDevice filters by the UI 20 BL vendor/product id', async () => {
      const device = createFakeDevice();
      const requestDevice = jest.fn(async () => [device]);
      (global.navigator as any).hid = { requestDevice, getDevices: jest.fn() };

      const result = await EposBusylightController.requestDevice();

      expect(requestDevice).toHaveBeenCalledWith({
        filters: [{ vendorId: EPOS_BUSYLIGHT_VENDOR_ID, productId: EPOS_BUSYLIGHT_PRODUCT_ID }],
      });
      expect(result).toBe(device);
    });

    it('findGrantedDevice only matches the UI 20 BL among every previously granted HID device', async () => {
      const other = createFakeDevice({ vendorId: 0x1, productId: 0x1 });
      const uiTwenty = createFakeDevice();
      (global.navigator as any).hid = { requestDevice: jest.fn(), getDevices: jest.fn(async () => [other, uiTwenty]) };

      expect(await EposBusylightController.findGrantedDevice()).toBe(uiTwenty);
    });

    it('returns undefined for both when WebHID is unavailable', async () => {
      delete (global.navigator as any).hid;
      expect(await EposBusylightController.requestDevice()).toBeUndefined();
      expect(await EposBusylightController.findGrantedDevice()).toBeUndefined();
    });
  });

  describe('connect/disconnect', () => {
    it('opens an unopened device and marks the controller connected', async () => {
      const device = createFakeDevice();
      const controller = new EposBusylightController();

      await controller.connect(device);

      expect(device.open).toHaveBeenCalledTimes(1);
      expect(controller.isConnected).toBe(true);
    });

    it('does not re-open an already-open device', async () => {
      const device = createFakeDevice({ opened: true });
      const controller = new EposBusylightController();

      await controller.connect(device);

      expect(device.open).not.toHaveBeenCalled();
    });

    it('closes the device and resets phase on disconnect', async () => {
      const device = createFakeDevice({ opened: true });
      const controller = new EposBusylightController();
      await controller.connect(device);
      await controller.setPhase('busy');

      await controller.disconnect();

      expect(device.close).toHaveBeenCalledTimes(1);
      expect(controller.isConnected).toBe(false);
      expect(controller.phase).toEqual('idle');
    });
  });

  describe('setPhase', () => {
    it('sends the busy color as a solid LED report using the reverse-engineered header', async () => {
      const device = createFakeDevice({ opened: true });
      const controller = new EposBusylightController();
      await controller.connect(device);

      await controller.setPhase('busy');

      expect(device.sendReport).toHaveBeenCalledTimes(1);
      const [reportId, data] = device.sendReport.mock.calls[0];
      expect(reportId).toEqual(1);
      const bytes = Array.from(data as Uint8Array);
      expect(bytes.slice(0, 9)).toEqual([0x12, 0x02, 0xc0, 0x00, 0x00, 0xc0, 0x00, 0x00, 0x01]);
      expect(bytes).toHaveLength(73);
    });

    it('sends the held color distinct from busy', async () => {
      const device = createFakeDevice({ opened: true });
      const controller = new EposBusylightController();
      await controller.connect(device);

      await controller.setPhase('held');

      const bytes = Array.from(device.sendReport.mock.calls[0][1] as Uint8Array);
      expect(bytes.slice(2, 5)).toEqual([0x00, 0x00, 0xc0]);
    });

    it('turns the light off for idle', async () => {
      const device = createFakeDevice({ opened: true });
      const controller = new EposBusylightController();
      await controller.connect(device);

      await controller.setPhase('idle');

      const bytes = Array.from(device.sendReport.mock.calls[0][1] as Uint8Array);
      expect(bytes.slice(2, 9)).toEqual([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    });

    it('blinks between the ringing color and off, and stops blinking when superseded', async () => {
      jest.useFakeTimers();
      const device = createFakeDevice({ opened: true });
      const controller = new EposBusylightController();
      await controller.connect(device);

      await controller.setPhase('ringing');
      expect(device.sendReport).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(BUSYLIGHT_BLINK_INTERVAL_MS);
      expect(device.sendReport).toHaveBeenCalledTimes(2);
      const offBytes = Array.from(device.sendReport.mock.calls[1][1] as Uint8Array);
      expect(offBytes[8]).toEqual(0x00);

      jest.advanceTimersByTime(BUSYLIGHT_BLINK_INTERVAL_MS);
      expect(device.sendReport).toHaveBeenCalledTimes(3);

      await controller.setPhase('busy');
      const callsAfterBusy = device.sendReport.mock.calls.length;
      jest.advanceTimersByTime(BUSYLIGHT_BLINK_INTERVAL_MS * 3);
      expect(device.sendReport).toHaveBeenCalledTimes(callsAfterBusy);
    });

    it('is a safe no-op when no device is connected', async () => {
      const controller = new EposBusylightController();
      await expect(controller.setPhase('busy')).resolves.toBeUndefined();
    });
  });

  describe('report length', () => {
    it('uses the byte length declared by the device output-report descriptor', async () => {
      const device = createFakeDevice({
        opened: true,
        collections: [{
          outputReports: [{ reportId: 1, items: [{ reportSize: 8, reportCount: 32 }] }],
        }] as any,
      });
      const controller = new EposBusylightController();

      await controller.connect(device);
      await controller.setPhase('busy');

      const bytes = device.sendReport.mock.calls[0][1] as Uint8Array;
      expect(bytes).toHaveLength(32);
    });

    it('falls back to the reverse-engineered length when the descriptor has no matching report', async () => {
      const device = createFakeDevice({ opened: true, collections: [] });
      const controller = new EposBusylightController();

      await controller.connect(device);
      await controller.setPhase('busy');

      expect(device.sendReport.mock.calls[0][1] as Uint8Array).toHaveLength(73);
    });
  });

  describe('ring', () => {
    it('sends the volume report followed by the trigger report', async () => {
      const device = createFakeDevice({ opened: true });
      const controller = new EposBusylightController();
      await controller.connect(device);

      await controller.ring();

      expect(device.sendReport).toHaveBeenCalledTimes(2);
      const [firstReportId, firstData] = device.sendReport.mock.calls[0];
      const [secondReportId, secondData] = device.sendReport.mock.calls[1];
      expect(firstReportId).toEqual(1);
      expect(secondReportId).toEqual(1);
      expect(Array.from(firstData as Uint8Array).slice(0, 2)).toEqual([0x04, 0x06]);
      expect(Array.from(secondData as Uint8Array).slice(0, 5)).toEqual([0x09, 0x04, 0x01, 0x03, 0x01]);
      expect((firstData as Uint8Array)).toHaveLength(63);
    });

    it('is a safe no-op when no device is connected', async () => {
      const controller = new EposBusylightController();
      await expect(controller.ring()).resolves.toBeUndefined();
    });
  });
});
