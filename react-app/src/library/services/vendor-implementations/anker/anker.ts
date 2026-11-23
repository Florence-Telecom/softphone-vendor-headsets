import { VendorImplementation, ImplementationConfig } from '../vendor-implementation';
import { CallInfo } from '../../..';
import DeviceInfo from '../../../types/device-info';
import { PartialInputReportEvent } from '../../../types/consumed-headset-events';
import { checkWebHidSupport } from '../../../utils';

/*
 * Anker PowerConf speakerphones (tested with the PowerConf S330, 291a:3308).
 *
 * The device exposes a standard HID Telephony collection (usage page 0x0B, usage 0x01 "Phone"):
 *   Input  report 2: bit0 Hook Switch, bit1 Flash, bit2 Hold, bit3 Phone Mute
 *   Output report 3: bit0 Ring LED
 *   Output report 4: bit0 Mute LED
 *   Output report 5: bit0 Hold LED
 *   Output report 6: 12 LED bits + 7 padding bits (3 bytes); bit1 is Off-Hook
 *
 * Unlike most telephony headsets, the call button is stateless: every press sends the same
 * report (Hook Switch + Flash = 0x03) with no release report, regardless of the Off-Hook LED.
 * The call state is therefore tracked here and a press is interpreted from it:
 * ringing -> answer, call in progress -> hang up, idle -> ignored.
 */

export const ANKER_VENDOR_ID = 0x291A;

const TELEPHONY_USAGE_PAGE = 0x000B;
const PHONE_USAGE = 0x0001;
const HEADSET_USAGE = 0x0005;

const BUTTON_INPUT_REPORT_ID = 0x02;
const HOOK_SWITCH_BIT = 0x01;
const PHONE_MUTE_BIT = 0x08;

const RING_LED_REPORT_ID = 0x03;
const MUTE_LED_REPORT_ID = 0x04;
const HOLD_LED_REPORT_ID = 0x05;
const MULTI_LED_REPORT_ID = 0x06;
const OFF_HOOK_LED_BIT = 0x02;

type CallState = 'idle' | 'ringing' | 'active';

export default class AnkerService extends VendorImplementation {
  private static instance: AnkerService;

  vendorName = 'Anker';
  activeDevice: any = null;

  private _deviceInfo: DeviceInfo = null;
  private callState: CallState = 'idle';
  private activeConversationId: string = null;
  private pendingConversationId: string = null;
  private isHeld = false;

  static getInstance (config: ImplementationConfig): AnkerService {
    if (!AnkerService.instance || config.createNew) {
      AnkerService.instance = new AnkerService(config);
    }
    return AnkerService.instance;
  }

  get deviceInfo (): DeviceInfo {
    return this._deviceInfo;
  }

  get isDeviceAttached (): boolean {
    return !!this.activeDevice;
  }

  get _callState (): CallState {
    return this.callState;
  }

  isSupported (): boolean {
    return !!checkWebHidSupport(this.config, this.vendorName.toLowerCase());
  }

  deviceLabelMatchesVendor (label: string): boolean {
    const lowerLabel = label.toLowerCase();
    return ['powerconf', '(291a:'].some(searchVal => lowerLabel.includes(searchVal));
  }

  async connect (originalDeviceLabel: string): Promise<void> {
    this.logger.debug('Anker: connect attempt', { originalDeviceLabel });
    if (!this.isConnecting) {
      this.changeConnectionStatus({ isConnected: this.isConnected, isConnecting: true });
    }

    try {
      // A device granted earlier does not need the permission prompt again
      const grantedDevices = await (window.navigator as any).hid.getDevices();
      let device = this.selectDevice(grantedDevices, originalDeviceLabel);

      if (!device) {
        device = await new Promise((resolve, reject) => {
          const waiter = setTimeout(() => reject(new Error('The selected device was not granted WebHID permissions')), 30000);
          this.requestWebHidPermissions(async () => {
            try {
              const productId = this.deductProductId(originalDeviceLabel);
              const devices = await (window.navigator as any).hid.requestDevice({
                filters: [{ vendorId: ANKER_VENDOR_ID, productId: productId || undefined, usagePage: TELEPHONY_USAGE_PAGE }]
              });
              clearTimeout(waiter);
              const selected = this.selectDevice(devices, originalDeviceLabel);
              selected ? resolve(selected) : reject(new Error('No Anker telephony device was selected'));
            } catch (err) {
              clearTimeout(waiter);
              reject(err);
            }
          });
        });
      }

      if (!device.opened) {
        await device.open();
      }

      this.activeDevice = device;
      this.activeDevice.addEventListener('inputreport', this.handleInputReport);
      this._deviceInfo = { ProductName: device.productName };
      this.resetState();
      await this.syncLeds();

      this.logger.debug('Anker: connected', { productName: device.productName });
      this.changeConnectionStatus({ isConnected: true, isConnecting: false });
    } catch (error) {
      this.logger.error('Anker: failed to connect', error);
      this.activeDevice = null;
      this.isConnecting && this.changeConnectionStatus({ isConnected: this.isConnected, isConnecting: false });
    }
  }

  /**
   * Picks the Anker device exposing the telephony collection. When several are granted,
   * prefer the one whose product name appears in the selected microphone label.
   */
  selectDevice (devices: any[], originalDeviceLabel = ''): any {
    const label = originalDeviceLabel.toLowerCase();
    const candidates = (devices || []).filter(device =>
      device.vendorId === ANKER_VENDOR_ID &&
      device.collections?.some(c => c.usagePage === TELEPHONY_USAGE_PAGE && (c.usage === PHONE_USAGE || c.usage === HEADSET_USAGE))
    );
    return candidates.find(device => device.productName && label.includes(device.productName.toLowerCase())) || candidates[0] || null;
  }

  async disconnect (): Promise<void> {
    this.logger.debug('Anker: disconnect');
    if (this.activeDevice) {
      this.resetState();
      await this.syncLeds();
      this.activeDevice.removeEventListener('inputreport', this.handleInputReport);
      await this.activeDevice.close();
    }
    this.activeDevice = null;
    this._deviceInfo = null;
    if (this.isConnected || this.isConnecting) {
      this.changeConnectionStatus({ isConnected: false, isConnecting: false });
    }
  }

  handleInputReport = (event: PartialInputReportEvent): void => {
    if (event.reportId !== BUTTON_INPUT_REPORT_ID) {
      return;
    }
    const bits = event.data.getUint8(0);
    this.logger.debug(`Anker: received input report 0x${bits.toString(16).padStart(2, '0')}`, { callState: this.callState });

    if (bits & HOOK_SWITCH_BIT) {
      this.handleCallButtonPress();
    }
    if (bits & PHONE_MUTE_BIT) {
      this.handleMuteButtonPress();
    }
  }

  private handleCallButtonPress (): void {
    switch (this.callState) {
    case 'ringing': {
      const conversationId = this.pendingConversationId;
      this.markCallActive(conversationId);
      this.syncLeds();
      this.deviceAnsweredCall({ name: 'CallOffHook', conversationId });
      break;
    }
    case 'active': {
      const conversationId = this.activeConversationId;
      this.resetState();
      this.syncLeds();
      this.deviceEndedCall({ name: 'CallOnHook', conversationId });
      break;
    }
    default:
      this.logger.debug('Anker: call button pressed with no call to answer or end');
    }
  }

  private handleMuteButtonPress (): void {
    if (this.callState !== 'active') {
      this.logger.debug('Anker: mute button pressed with no active call');
      return;
    }
    this.isMuted = !this.isMuted;
    this.sendLed(MUTE_LED_REPORT_ID, [this.isMuted ? 1 : 0]);
    this.deviceMuteChanged({
      isMuted: this.isMuted,
      name: this.isMuted ? 'CallMuted' : 'CallUnmuted',
      conversationId: this.activeConversationId
    });
  }

  async incomingCall (callInfo: CallInfo): Promise<void> {
    this.pendingConversationId = callInfo.conversationId;
    if (this.callState === 'idle') {
      this.callState = 'ringing';
    }
    await this.syncLeds();
  }

  async outgoingCall (callInfo: CallInfo): Promise<void> {
    this.markCallActive(callInfo.conversationId);
    await this.syncLeds();
  }

  async answerCall (conversationId: string): Promise<void> {
    this.markCallActive(conversationId);
    await this.syncLeds();
  }

  async rejectCall (conversationId: string): Promise<void> {
    if (conversationId && conversationId !== this.pendingConversationId) {
      this.logger.debug('Anker: reject ignored for unknown conversation', { conversationId });
      return;
    }
    this.pendingConversationId = null;
    if (this.callState === 'ringing') {
      this.callState = 'idle';
    }
    await this.syncLeds();
  }

  async endCall (conversationId: string, hasOtherActiveCalls?: boolean): Promise<void> {
    if (conversationId && conversationId !== this.activeConversationId) {
      this.logger.debug('Anker: end ignored for unknown conversation', { conversationId });
      return;
    }
    if (hasOtherActiveCalls) {
      this.activeConversationId = null;
      return;
    }
    this.resetState();
    await this.syncLeds();
  }

  async endAllCalls (): Promise<void> {
    this.resetState();
    await this.syncLeds();
  }

  async setMute (value: boolean): Promise<void> {
    this.isMuted = value;
    await this.sendLed(MUTE_LED_REPORT_ID, [value ? 1 : 0]);
  }

  async setHold (conversationId: string, value: boolean): Promise<void> {
    this.isHeld = value;
    await this.sendLed(HOLD_LED_REPORT_ID, [value ? 1 : 0]);
  }

  private markCallActive (conversationId: string): void {
    this.activeConversationId = conversationId;
    if (this.pendingConversationId === conversationId) {
      this.pendingConversationId = null;
    }
    this.callState = 'active';
  }

  private resetState (): void {
    this.callState = 'idle';
    this.activeConversationId = null;
    this.pendingConversationId = null;
    this.isMuted = false;
    this.isHeld = false;
  }

  private async syncLeds (): Promise<void> {
    await this.sendLed(RING_LED_REPORT_ID, [this.callState === 'ringing' ? 1 : 0]);
    await this.sendLed(MULTI_LED_REPORT_ID, [this.callState === 'active' ? OFF_HOOK_LED_BIT : 0, 0, 0]);
    await this.sendLed(MUTE_LED_REPORT_ID, [this.isMuted ? 1 : 0]);
    await this.sendLed(HOLD_LED_REPORT_ID, [this.isHeld ? 1 : 0]);
  }

  private async sendLed (reportId: number, data: number[]): Promise<void> {
    if (!this.activeDevice) {
      return;
    }
    try {
      await this.activeDevice.sendReport(reportId, new Uint8Array(data));
    } catch (error) {
      this.logger.warn(`Anker: failed to send output report ${reportId}`, error);
    }
  }
}
