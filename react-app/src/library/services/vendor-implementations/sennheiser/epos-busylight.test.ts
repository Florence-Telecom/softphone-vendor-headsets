import {
  BUSYLIGHT_BLINK_INTERVAL_MS,
  BUSYLIGHT_REASSERT_INTERVAL_MS,
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

async function flushWrites (): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
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

    it('prefers the HID interface that declares the LED output report over the first listed one', async () => {
      const telephony = createFakeDevice({
        collections: [{ usagePage: 0x0b, usage: 0x05, inputReports: [{ reportId: 2 }], outputReports: [{ reportId: 3 }] }] as any,
      });
      const led = createFakeDevice({
        collections: [{ usagePage: 0xffa0, usage: 0x01, outputReports: [{ reportId: 1 }] }] as any,
      });
      (global.navigator as any).hid = {
        requestDevice: jest.fn(async () => [telephony, led]),
        getDevices: jest.fn(async () => [telephony, led]),
      };

      expect(await EposBusylightController.requestDevice()).toBe(led);
      expect(await EposBusylightController.findGrantedDevice()).toBe(led);
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

    it('re-sends a solid phase so another writer (EPOS Connect) cannot keep its own color', async () => {
      jest.useFakeTimers();
      const device = createFakeDevice({ opened: true });
      const controller = new EposBusylightController();
      await controller.connect(device);

      await controller.setPhase('busy');
      jest.advanceTimersByTime(BUSYLIGHT_REASSERT_INTERVAL_MS);
      await flushWrites();
      jest.advanceTimersByTime(BUSYLIGHT_REASSERT_INTERVAL_MS);
      await flushWrites();

      expect(device.sendReport).toHaveBeenCalledTimes(3);
      const bytes = Array.from(device.sendReport.mock.calls[2][1] as Uint8Array);
      expect(bytes.slice(2, 5)).toEqual([0xc0, 0x00, 0x00]);

      await controller.setPhase('idle');
      const callsAfterIdle = device.sendReport.mock.calls.length;
      jest.advanceTimersByTime(BUSYLIGHT_REASSERT_INTERVAL_MS * 3);
      expect(device.sendReport).toHaveBeenCalledTimes(callsAfterIdle);
    });

    it('blinks between the ringing color and off, and stops blinking when superseded', async () => {
      jest.useFakeTimers();
      const device = createFakeDevice({ opened: true });
      const controller = new EposBusylightController();
      await controller.connect(device);

      await controller.setPhase('ringing');
      expect(device.sendReport).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(BUSYLIGHT_BLINK_INTERVAL_MS);
      await flushWrites();
      expect(device.sendReport).toHaveBeenCalledTimes(2);
      const offBytes = Array.from(device.sendReport.mock.calls[1][1] as Uint8Array);
      expect(offBytes[8]).toEqual(0x00);

      jest.advanceTimersByTime(BUSYLIGHT_BLINK_INTERVAL_MS);
      await flushWrites();
      expect(device.sendReport).toHaveBeenCalledTimes(3);

      await controller.setPhase('idle');
      const callsAfterIdle = device.sendReport.mock.calls.length;
      jest.advanceTimersByTime(BUSYLIGHT_BLINK_INTERVAL_MS * 3);
      expect(device.sendReport).toHaveBeenCalledTimes(callsAfterIdle);
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

  describe('report framing', () => {
    it('sends report 0 with the 0x01 marker kept as payload when the device declares no report IDs', async () => {
      const device = createFakeDevice({
        opened: true,
        collections: [{ outputReports: [{ reportId: 0, items: [{ reportSize: 8, reportCount: 74 }] }] }] as any,
      });
      const controller = new EposBusylightController();

      await controller.connect(device);
      await controller.setPhase('busy');

      const [reportId, data] = device.sendReport.mock.calls[0];
      expect(reportId).toEqual(0);
      expect(Array.from(data as Uint8Array).slice(0, 4)).toEqual([0x01, 0x12, 0x02, 0xc0]);
      expect(data as Uint8Array).toHaveLength(74);
    });

    it('falls back to the reference lengths when a declared report has no sized items', async () => {
      const numbered = createFakeDevice({ opened: true, collections: [{ outputReports: [{ reportId: 1 }] }] as any });
      const unnumbered = createFakeDevice({ opened: true, collections: [{ outputReports: [{ reportId: 0 }] }] as any });
      const first = new EposBusylightController();
      const second = new EposBusylightController();

      await first.connect(numbered);
      await second.connect(unnumbered);
      await first.setPhase('busy');
      await second.setPhase('busy');
      await second.ring();

      expect(numbered.sendReport.mock.calls[0][1] as Uint8Array).toHaveLength(73);
      expect(unnumbered.sendReport.mock.calls[0][1] as Uint8Array).toHaveLength(74);
      expect(unnumbered.sendReport.mock.calls[1][1] as Uint8Array).toHaveLength(64);
    });

    it('prefers an unnumbered LED interface over an unrelated one when no report 1 exists', () => {
      const unrelated = createFakeDevice({ collections: [{ outputReports: [{ reportId: 3 }] }] as any });
      const unnumbered = createFakeDevice({ collections: [{ outputReports: [{ reportId: 0 }] }] as any });
      expect(EposBusylightController.pickDevice([unrelated, unnumbered])).toBe(unnumbered);
      expect(EposBusylightController.pickDevice([unrelated])).toBe(unrelated);
      expect(EposBusylightController.pickDevice([])).toBeUndefined();
    });

    it('wraps non-Error write failures', async () => {
      const onWriteError = jest.fn();
      const device = createFakeDevice({ opened: true });
      device.sendReport.mockRejectedValueOnce('boom');
      const controller = new EposBusylightController({ onWriteError });
      await controller.connect(device);

      await expect(controller.setPhase('idle')).rejects.toEqual('boom');
      await flushWrites();

      expect(onWriteError).toHaveBeenCalledWith(new Error('boom'));
    });

    it('refuses an interface whose output reports cannot carry the LED packet', async () => {
      const device = createFakeDevice({
        collections: [{ usagePage: 0x0b, usage: 0x05, outputReports: [{ reportId: 3, items: [{ reportSize: 8, reportCount: 2 }] }] }] as any,
      });
      const controller = new EposBusylightController();

      await expect(controller.connect(device)).rejects.toThrow('page=0xb usage=0x5 out=3:2B');
      expect(device.open).not.toHaveBeenCalled();
      expect(controller.isConnected).toBe(false);
    });
  });

  describe('write failures', () => {
    it('reports every failed write, including timer-driven ones, and signals recovery once', async () => {
      jest.useFakeTimers();
      const onWriteError = jest.fn();
      const onWriteRecovered = jest.fn();
      const device = createFakeDevice({ opened: true });
      device.sendReport
        .mockRejectedValueOnce(new Error('Failed to write the report.'))
        .mockRejectedValueOnce(new Error('Failed to write the report.'));
      const controller = new EposBusylightController({ onWriteError, onWriteRecovered });
      await controller.connect(device);

      await expect(controller.setPhase('busy')).rejects.toThrow('Failed to write the report.');
      await flushWrites();
      jest.advanceTimersByTime(BUSYLIGHT_REASSERT_INTERVAL_MS);
      await flushWrites();
      expect(onWriteError).toHaveBeenCalledTimes(2);
      expect(onWriteRecovered).not.toHaveBeenCalled();

      jest.advanceTimersByTime(BUSYLIGHT_REASSERT_INTERVAL_MS);
      await flushWrites();
      jest.advanceTimersByTime(BUSYLIGHT_REASSERT_INTERVAL_MS);
      await flushWrites();
      expect(onWriteRecovered).toHaveBeenCalledTimes(1);
      expect(onWriteError).toHaveBeenCalledTimes(2);
    });
  });

  describe('describeDevice', () => {
    it('summarizes every collection and report length', () => {
      const device = createFakeDevice({
        collections: [{
          usagePage: 0xffa0,
          usage: 1,
          inputReports: [{ reportId: 1, items: [{ reportSize: 8, reportCount: 63 }] }],
          outputReports: [{ reportId: 1, items: [{ reportSize: 8, reportCount: 73 }] }],
        }] as any,
      });

      expect(EposBusylightController.describeDevice(device))
        .toEqual('0x1395:0x74 [page=0xffa0 usage=0x1 in=1:63B out=1:73B]');
    });

    it('marks unknown usages and lengths, and devices without collections', () => {
      expect(EposBusylightController.describeDevice(createFakeDevice({
        collections: [{ featureReports: [{ reportId: 5 }] }] as any,
      }))).toEqual('0x1395:0x74 [page=? usage=? feat=5:?B]');
      expect(EposBusylightController.describeDevice(createFakeDevice({ collections: undefined as any })))
        .toEqual('0x1395:0x74 [no collections]');
    });

    it('exposes the connected device summary for diagnostics', async () => {
      const controller = new EposBusylightController();
      expect(controller.deviceSummary).toBeUndefined();

      await controller.connect(createFakeDevice());

      expect(controller.deviceSummary).toEqual('0x1395:0x74 [no collections]');
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
