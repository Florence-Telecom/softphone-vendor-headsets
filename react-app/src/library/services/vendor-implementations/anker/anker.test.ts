import AnkerService, { ANKER_VENDOR_ID } from './anker';
import * as utils from '../../../utils';

const S330_LABEL = 'Anker PowerConf S330 (291a:3308)';

const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0));

function createMockDevice (overrides: any = {}) {
  const listeners: Record<string, (event: any) => void> = {};
  return {
    vendorId: ANKER_VENDOR_ID,
    productId: 0x3308,
    productName: 'Anker PowerConf S330',
    opened: false,
    collections: [
      { usagePage: 0x000C, usage: 0x0001, inputReports: [{ reportId: 1 }], outputReports: [] },
      { usagePage: 0x000B, usage: 0x0001, inputReports: [{ reportId: 2 }], outputReports: [{ reportId: 3 }] }
    ],
    open: jest.fn(function () { this.opened = true; return Promise.resolve(); }),
    close: jest.fn().mockResolvedValue(undefined),
    sendReport: jest.fn().mockResolvedValue(undefined),
    addEventListener: jest.fn((name, cb) => { listeners[name] = cb; }),
    removeEventListener: jest.fn((name) => { delete listeners[name]; }),
    press (bits: number) {
      listeners.inputreport({ reportId: 2, data: new DataView(Uint8Array.of(bits).buffer) });
    },
    ...overrides
  };
}

function lastReport (device: any, reportId: number): number[] {
  const calls = device.sendReport.mock.calls.filter(([id]) => id === reportId);
  return calls.length ? Array.from(calls[calls.length - 1][1]) : null;
}

describe('AnkerService', () => {
  let anker: AnkerService;
  let device: ReturnType<typeof createMockDevice>;

  beforeEach(() => {
    device = createMockDevice();
    (window.navigator as any).hid = {
      getDevices: jest.fn().mockResolvedValue([device]),
      requestDevice: jest.fn().mockResolvedValue([device])
    };
    anker = AnkerService.getInstance({ logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }, createNew: true });
  });

  afterEach(() => {
    delete (window.navigator as any).hid;
  });

  describe('deviceLabelMatchesVendor', () => {
    it('matches PowerConf labels and the Anker vendor id', () => {
      expect(anker.deviceLabelMatchesVendor('Anker PowerConf S330 Mono')).toBe(true);
      expect(anker.deviceLabelMatchesVendor('Echo Cancelling Speakerphone (291a:3308)')).toBe(true);
      expect(anker.deviceLabelMatchesVendor('Jabra Speak 710 (0b0e:2477)')).toBe(false);
    });
  });

  describe('isSupported', () => {
    it('relies on WebHID support', () => {
      const spy = jest.spyOn(utils, 'checkWebHidSupport').mockReturnValue(false);
      expect(anker.isSupported()).toBe(false);
      spy.mockReturnValue(true);
      expect(anker.isSupported()).toBe(true);
      spy.mockRestore();
    });
  });

  describe('connect', () => {
    it('opens a previously granted device without prompting', async () => {
      const statusSpy = jest.spyOn(anker, 'changeConnectionStatus');
      await anker.connect(S330_LABEL);

      expect(device.open).toHaveBeenCalled();
      expect((window.navigator as any).hid.requestDevice).not.toHaveBeenCalled();
      expect(anker.activeDevice).toBe(device);
      expect(anker.deviceInfo).toEqual({ ProductName: 'Anker PowerConf S330' });
      expect(statusSpy).toHaveBeenLastCalledWith({ isConnected: true, isConnecting: false });
    });

    it('requests WebHID permission when no device was granted', async () => {
      (window.navigator as any).hid.getDevices.mockResolvedValue([]);
      jest.spyOn(anker, 'requestWebHidPermissions').mockImplementation((cb) => cb());

      await anker.connect(S330_LABEL);

      expect((window.navigator as any).hid.requestDevice).toHaveBeenCalledWith({
        filters: [{ vendorId: ANKER_VENDOR_ID, productId: 0x3308, usagePage: 0x000B }]
      });
      expect(anker.isConnected).toBe(true);
    });

    it('ignores Anker devices without a telephony collection', async () => {
      const noTelephony = createMockDevice({ collections: [{ usagePage: 0x000C, usage: 0x0001, inputReports: [], outputReports: [] }] });
      (window.navigator as any).hid.getDevices.mockResolvedValue([noTelephony]);
      (window.navigator as any).hid.requestDevice.mockResolvedValue([noTelephony]);
      jest.spyOn(anker, 'requestWebHidPermissions').mockImplementation((cb) => cb());

      await anker.connect(S330_LABEL);

      expect(anker.isConnected).toBe(false);
      expect(anker.isConnecting).toBe(false);
      expect(anker.activeDevice).toBeNull();
    });
  });

  describe('call button', () => {
    beforeEach(async () => {
      await anker.connect(S330_LABEL);
      device.sendReport.mockClear();
    });

    it('answers a ringing call', async () => {
      const answeredSpy = jest.spyOn(anker, 'deviceAnsweredCall');
      await anker.incomingCall({ conversationId: 'conv1', contactName: 'Jane' });
      expect(lastReport(device, 3)).toEqual([1]);

      device.press(0x03);
      await flushPromises();

      expect(answeredSpy).toHaveBeenCalledWith({ name: 'CallOffHook', conversationId: 'conv1' });
      expect(anker._callState).toBe('active');
      expect(lastReport(device, 3)).toEqual([0]);
      expect(lastReport(device, 6)).toEqual([0x02, 0, 0]);
    });

    it('ends an active call', async () => {
      const endedSpy = jest.spyOn(anker, 'deviceEndedCall');
      await anker.outgoingCall({ conversationId: 'conv2', contactName: 'Joe' });

      device.press(0x03);
      await flushPromises();

      expect(endedSpy).toHaveBeenCalledWith({ name: 'CallOnHook', conversationId: 'conv2' });
      expect(anker._callState).toBe('idle');
      expect(lastReport(device, 6)).toEqual([0, 0, 0]);
    });

    it('does nothing when idle', () => {
      const answeredSpy = jest.spyOn(anker, 'deviceAnsweredCall');
      const endedSpy = jest.spyOn(anker, 'deviceEndedCall');

      device.press(0x03);

      expect(answeredSpy).not.toHaveBeenCalled();
      expect(endedSpy).not.toHaveBeenCalled();
      expect(anker._callState).toBe('idle');
    });

    it('ignores other report ids', async () => {
      await anker.incomingCall({ conversationId: 'conv1', contactName: 'Jane' });
      anker.handleInputReport({ reportId: 1, data: new DataView(Uint8Array.of(0x03).buffer) });
      expect(anker._callState).toBe('ringing');
    });
  });

  describe('state echoes from the device', () => {
    beforeEach(async () => {
      await anker.connect(S330_LABEL);
    });

    // Regression: muting from the app made the S330 echo 0x09 (Hook Switch + Phone Mute),
    // which was handled as a call button press and hung up the call.
    it('does not end the call when the device echoes an app mute', async () => {
      const endedSpy = jest.spyOn(anker, 'deviceEndedCall');
      const muteSpy = jest.spyOn(anker, 'deviceMuteChanged');
      await anker.answerCall('conv3');
      await anker.setMute(true);

      device.press(0x09);

      expect(endedSpy).not.toHaveBeenCalled();
      expect(muteSpy).not.toHaveBeenCalled();
      expect(anker._callState).toBe('active');
    });

    it('does not treat Hook Switch without Flash as a press', async () => {
      const endedSpy = jest.spyOn(anker, 'deviceEndedCall');
      await anker.answerCall('conv3');
      device.press(0x01);
      expect(endedSpy).not.toHaveBeenCalled();
      expect(anker._callState).toBe('active');
    });

    it('syncs a mute state change reported by the device', async () => {
      const muteSpy = jest.spyOn(anker, 'deviceMuteChanged');
      await anker.answerCall('conv3');

      device.press(0x09);
      expect(muteSpy).toHaveBeenLastCalledWith({ isMuted: true, name: 'CallMuted', conversationId: 'conv3' });

      device.press(0x01);
      expect(muteSpy).toHaveBeenLastCalledWith({ isMuted: false, name: 'CallUnmuted', conversationId: 'conv3' });
      expect(muteSpy).toHaveBeenCalledTimes(2);
    });

    it('ignores mute state outside a call', () => {
      const muteSpy = jest.spyOn(anker, 'deviceMuteChanged');
      device.press(0x09);
      expect(muteSpy).not.toHaveBeenCalled();
    });

    it('still ends the call on a real button press while muted', async () => {
      const endedSpy = jest.spyOn(anker, 'deviceEndedCall');
      await anker.answerCall('conv3');
      await anker.setMute(true);
      device.press(0x03);
      expect(endedSpy).toHaveBeenCalledWith({ name: 'CallOnHook', conversationId: 'conv3' });
    });
  });

  describe('app driven state', () => {
    beforeEach(async () => {
      await anker.connect(S330_LABEL);
    });

    it('stops ringing when the app rejects the call', async () => {
      await anker.incomingCall({ conversationId: 'conv4', contactName: 'Jane' });
      await anker.rejectCall('conv4');
      expect(anker._callState).toBe('idle');
      expect(lastReport(device, 3)).toEqual([0]);
    });

    it('keeps the active call when another conversation is rejected', async () => {
      await anker.answerCall('conv5');
      await anker.incomingCall({ conversationId: 'conv6', contactName: 'Jane' });
      await anker.rejectCall('conv6');
      expect(anker._callState).toBe('active');
    });

    it('ignores endCall for another conversation', async () => {
      await anker.answerCall('conv7');
      await anker.endCall('other', false);
      expect(anker._callState).toBe('active');
    });

    it('drives mute and hold LEDs', async () => {
      await anker.setMute(true);
      await anker.setHold('conv8', true);
      expect(lastReport(device, 4)).toEqual([1]);
      expect(lastReport(device, 5)).toEqual([1]);
    });

    it('resets LEDs and closes the device on disconnect', async () => {
      await anker.answerCall('conv9');
      await anker.disconnect();
      expect(lastReport(device, 6)).toEqual([0, 0, 0]);
      expect(device.close).toHaveBeenCalled();
      expect(device.removeEventListener).toHaveBeenCalled();
      expect(anker.isConnected).toBe(false);
    });
  });
});
