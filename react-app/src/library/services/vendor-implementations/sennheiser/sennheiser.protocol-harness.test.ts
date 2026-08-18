import SennheiserService from './sennheiser';
import { mockLogger } from '../../../test-utils';
import { SennheiserPayload, SennheiserEvents } from './types';

/**
 * A scripted EPOS Connect 8.6 loopback peer. Drives the real, compiled
 * SennheiserService (not a mocked HeadsetService) through the documented
 * handshake and call-control frames so the exact JSON sent to EPOS can be
 * asserted.
 *
 * This proves Papaya cannot send a sequence the documented basic-busylight
 * model could not drive; it does not certify the physical UI 20.
 */
class FakeEposPeer {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = FakeEposPeer.CONNECTING;
  sent: SennheiserPayload[] = [];
  onopen: (() => void) | null = null;
  onclose: ((event: { code: number; reason: string; wasClean: boolean }) => void) | null = null;
  onmessage: ((message: { data: string }) => void) | null = null;

  constructor (private autoRespond = true) {}

  open (): void {
    this.readyState = FakeEposPeer.OPEN;
    this.onopen?.();
    this.deliver({ Event: SennheiserEvents.SocketConnected });
  }

  send (data: string): void {
    const payload: SennheiserPayload = JSON.parse(data);
    this.sent.push(payload);
    if (!this.autoRespond) return;

    // Models only the phases EPOS Connect 8.6 is documented/observed to
    // acknowledge. Call-control requests below are not echoed back here — EPOS
    // responds to those with hardware button notifications, not application-level
    // acks.
    switch (payload.Event) {
    case SennheiserEvents.EstablishConnection:
      this.deliver({ Event: SennheiserEvents.EstablishConnection });
      break;
    case SennheiserEvents.SPLogin:
      this.deliver({ Event: SennheiserEvents.SPLogin });
      break;
    case SennheiserEvents.SystemInformation:
      this.deliver({ Event: SennheiserEvents.SystemInformation });
      break;
    default:
      break;
    }
  }

  close (): void {
    this.readyState = FakeEposPeer.CLOSED;
  }

  deliver (payload: SennheiserPayload): void {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }

  headsetConnected (name: string, type = 'D 10 BS Phone US'): void {
    this.deliver({ Event: SennheiserEvents.HeadsetConnected, HeadsetName: name, HeadsetType: type });
  }

  headsetDisconnected (name: string): void {
    this.deliver({ Event: SennheiserEvents.HeadsetDisconnected, HeadsetName: name });
  }

  callControlFrames (): SennheiserPayload[] {
    const handshakeEvents: string[] = [
      SennheiserEvents.EstablishConnection,
      SennheiserEvents.SPLogin,
      SennheiserEvents.SystemInformation,
    ];
    return this.sent.filter(payload => !handshakeEvents.includes(payload.Event));
  }
}

/** Basic busylight state derived only from the outgoing frame sequence. */
function deriveBusylightState (frames: SennheiserPayload[]): Array<'idle' | 'ringing' | 'busy'> {
  const states: Array<'idle' | 'ringing' | 'busy'> = [];
  for (const frame of frames) {
    switch (frame.Event) {
    case SennheiserEvents.IncomingCall:
      states.push('ringing');
      break;
    case SennheiserEvents.IncomingCallAccepted:
    case SennheiserEvents.OutgoingCall:
      states.push('busy');
      break;
    case SennheiserEvents.CallEnded:
    case SennheiserEvents.IncomingCallRejected:
      states.push('idle');
      break;
    default:
      break;
    }
  }
  return states;
}

describe('Sennheiser protocol harness (fake EPOS 8.6 peer)', () => {
  let service: SennheiserService;
  let peer: FakeEposPeer;
  let originalWebSocket: typeof WebSocket;

  beforeEach(() => {
    service = SennheiserService.getInstance({
      logger: mockLogger,
      appName: 'florence-telecom-console',
      createNew: true,
    });
    peer = new FakeEposPeer();
    originalWebSocket = global.WebSocket;
    const WebSocketMock: any = jest.fn().mockImplementation(() => peer);
    WebSocketMock.CONNECTING = FakeEposPeer.CONNECTING;
    WebSocketMock.OPEN = FakeEposPeer.OPEN;
    WebSocketMock.CLOSING = FakeEposPeer.CLOSING;
    WebSocketMock.CLOSED = FakeEposPeer.CLOSED;
    global.WebSocket = WebSocketMock;
  });

  afterEach(() => {
    global.WebSocket = originalWebSocket;
  });

  it('completes the documented handshake with the exact registration payload', () => {
    service.connect();
    peer.open();

    expect(peer.sent).toEqual([
      {
        Event: SennheiserEvents.EstablishConnection,
        EventType: 'Request',
        SPName: 'florence-telecom-console',
        SPIconImage: 'SPImage.ico',
        RedialSupport: 'No',
        OffHookSupport: 'No',
        MuteSupport: 'Yes',
        DNDOption: 'No',
      },
      { Event: SennheiserEvents.SPLogin, EventType: 'Request' },
      { Event: SennheiserEvents.SystemInformation, EventType: 'Request' },
    ]);
    expect(service.integrationStatus).toEqual({
      transport: 'open',
      registration: 'established',
      login: 'loggedIn',
      headsetAttachment: 'unknown',
      headsetProductName: undefined,
      systemInformationReceived: true,
      lastProtocolResult: { event: SennheiserEvents.SPLogin, outcome: 'success' },
    });
  });

  it('reports headset attachment only after HeadsetConnected, and clears it on disconnect', () => {
    service.connect();
    peer.open();
    expect(service.integrationStatus.headsetAttachment).toEqual('unknown');

    peer.headsetConnected('Sennheiser D 10 BS Phone US');
    expect(service.integrationStatus.headsetAttachment).toEqual('attached');
    expect(service.integrationStatus.headsetProductName).toEqual('Sennheiser D 10 BS Phone US');

    peer.headsetDisconnected('Sennheiser D 10 BS Phone US');
    expect(service.integrationStatus.headsetAttachment).toEqual('detached');
  });

  it('drives incoming -> answer -> end as IncomingCall -> InCallAccepted -> CallEnded and back to idle', async () => {
    service.connect();
    peer.open();

    await service.incomingCall({ conversationId: 'call-1' });
    await service.answerCall('call-1');
    await service.endCall('call-1', false);

    const frames = peer.callControlFrames();
    expect(frames).toEqual([
      { Event: SennheiserEvents.IncomingCall, EventType: 'Request', CallID: 'call-1' },
      { Event: SennheiserEvents.IncomingCallAccepted, EventType: 'Request', CallID: 'call-1' },
      { Event: SennheiserEvents.Resume, EventType: 'Request' },
      { Event: SennheiserEvents.UnmuteFromApp, EventType: 'Request' },
      { Event: SennheiserEvents.CallEnded, EventType: 'Request', CallID: 'call-1' },
    ]);
    expect(deriveBusylightState(frames)).toEqual(['ringing', 'busy', 'idle']);
  });

  it('drives incoming -> reject as IncomingCall -> InCallRejected without ringing the light again', async () => {
    service.connect();
    peer.open();

    await service.incomingCall({ conversationId: 'call-2' });
    await service.rejectCall('call-2');

    const frames = peer.callControlFrames();
    expect(frames).toEqual([
      { Event: SennheiserEvents.IncomingCall, EventType: 'Request', CallID: 'call-2' },
      { Event: SennheiserEvents.IncomingCallRejected, EventType: 'Request', CallID: 'call-2' },
    ]);
    expect(deriveBusylightState(frames)).toEqual(['ringing', 'idle']);
  });

  it('drives outgoing -> end as OutgoingCall -> CallEnded with no InCallAccepted in between', async () => {
    service.connect();
    peer.open();

    await service.outgoingCall({ conversationId: 'call-3' });
    // A real outgoing-accepted event never calls answerCall() — see
    // WazoPhoneClientCtx.onCallAccepted, which only notifies EPOS for the
    // incoming direction. Only the busylight-relevant frames are asserted here.
    await service.endCall('call-3', false);

    const frames = peer.callControlFrames();
    expect(frames).toEqual([
      { Event: SennheiserEvents.OutgoingCall, EventType: 'Request', CallID: 'call-3' },
      { Event: SennheiserEvents.Resume, EventType: 'Request' },
      { Event: SennheiserEvents.UnmuteFromApp, EventType: 'Request' },
      { Event: SennheiserEvents.CallEnded, EventType: 'Request', CallID: 'call-3' },
    ]);
    expect(deriveBusylightState(frames)).toEqual(['busy', 'idle']);
  });

  it('keeps the light busy until the final call of two active calls ends', async () => {
    service.connect();
    peer.open();

    await service.incomingCall({ conversationId: 'call-a' });
    await service.answerCall('call-a');
    await service.outgoingCall({ conversationId: 'call-b' });
    await service.endCall('call-a', true);
    await service.endCall('call-b', false);

    const frames = peer.callControlFrames();
    const endFrames = frames.filter(frame => frame.Event === SennheiserEvents.CallEnded);
    expect(endFrames).toEqual([
      { Event: SennheiserEvents.CallEnded, EventType: 'Request', CallID: 'call-a' },
      { Event: SennheiserEvents.CallEnded, EventType: 'Request', CallID: 'call-b' },
    ]);
    // Only the final endCall (hasOtherActiveCalls: false) resets mute/hold.
    expect(frames.filter(frame => frame.Event === SennheiserEvents.Resume)).toHaveLength(1);
  });

  it('ignores frames from a retired socket after reconnecting', () => {
    service.connect();
    const staleSocket = peer;
    staleSocket.open();

    const secondPeer = new FakeEposPeer();
    (global.WebSocket as any).mockImplementation(() => secondPeer);
    service.connect();

    staleSocket.deliver({ Event: SennheiserEvents.HeadsetConnected, HeadsetName: 'stale device' });
    expect(service.integrationStatus.headsetAttachment).toEqual('unknown');

    secondPeer.open();
    expect(service.integrationStatus.transport).toEqual('open');
  });
});
