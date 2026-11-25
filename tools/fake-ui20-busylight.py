#!/usr/bin/env python3
"""Emulate an EPOS/Sennheiser UI 20 BL busylight on Linux through /dev/uhid.

Chrome's WebHID sees the virtual device exactly like real USB hardware, so papaya-ui's
"Enable busylight" flow, call-event wiring and EposBusylightController can be exercised
end to end without the light. Every output report Chrome sends is decoded and printed.

What this can NOT tell you: the real device's HID descriptor (the layouts below are
guesses that cover the cases the controller handles), or how EPOS Connect behaves.
--compete only approximates EPOS Connect by repainting the light green from a second
host-side writer.

Usage (root is needed for /dev/uhid and to open the hidraw nodes to your user):

    sudo python3 tools/fake-ui20-busylight.py                     # one numbered interface
    sudo python3 tools/fake-ui20-busylight.py --layout split      # telephony + LED interfaces
    sudo python3 tools/fake-ui20-busylight.py --layout unnumbered # no report IDs
    sudo python3 tools/fake-ui20-busylight.py --layout wrong      # no LED report at all
    sudo python3 tools/fake-ui20-busylight.py --compete 5         # repaint green every 5 s
    sudo python3 tools/fake-ui20-busylight.py --unplug-after 30   # vanish after 30 s
    python3 tools/fake-ui20-busylight.py --self-test              # no root, no device

Then open papaya in Chrome, select an EPOS provider, click "Enable busylight" and pick
"Sennheiser UI 20 BL USB (fake)". Stop with Ctrl+C; the virtual device is destroyed.
"""

import argparse
import glob
import os
import selectors
import struct
import sys
import time

VENDOR_ID = 0x1395
PRODUCT_ID = 0x0074
BUS_USB = 0x03

UHID_DESTROY = 1
UHID_START = 2
UHID_STOP = 3
UHID_OPEN = 4
UHID_CLOSE = 5
UHID_OUTPUT = 6
UHID_GET_REPORT = 9
UHID_GET_REPORT_REPLY = 10
UHID_CREATE2 = 11
UHID_SET_REPORT = 13
UHID_SET_REPORT_REPLY = 14

DATA_MAX = 4096
# struct uhid_event is packed: a u32 type followed by a union whose largest member is
# uhid_create2_req (128 + 64 + 64 + 2 + 2 + 4 * 4 + 4096 bytes).
EVENT_SIZE = 4 + 128 + 64 + 64 + 2 + 2 + 4 * 4 + DATA_MAX
EIO = 5

LED_LENGTH = 73  # payload bytes after the 0x01 report ID / marker
INPUT_LENGTH = 63

VENDOR_NUMBERED = bytes([
    0x06, 0xA0, 0xFF,        # Usage Page (Vendor 0xFFA0)
    0x09, 0x01,              # Usage (0x01)
    0xA1, 0x01,              # Collection (Application)
    0x85, 0x01,              #   Report ID (1)
    0x15, 0x00,              #   Logical Minimum (0)
    0x26, 0xFF, 0x00,        #   Logical Maximum (255)
    0x75, 0x08,              #   Report Size (8)
    0x95, INPUT_LENGTH,      #   Report Count (63)
    0x09, 0x01,              #   Usage (0x01)
    0x81, 0x02,              #   Input (Data, Var, Abs)
    0x95, LED_LENGTH,        #   Report Count (73)
    0x09, 0x01,              #   Usage (0x01)
    0x91, 0x02,              #   Output (Data, Var, Abs)
    0xC0,                    # End Collection
])

VENDOR_UNNUMBERED = bytes([
    0x06, 0xA0, 0xFF, 0x09, 0x01, 0xA1, 0x01,
    0x15, 0x00, 0x26, 0xFF, 0x00, 0x75, 0x08,
    0x95, INPUT_LENGTH + 1, 0x09, 0x01, 0x81, 0x02,
    0x95, LED_LENGTH + 1, 0x09, 0x01, 0x91, 0x02,
    0xC0,
])

TELEPHONY = bytes([
    0x05, 0x0B,              # Usage Page (Telephony)
    0x09, 0x05,              # Usage (Headset)
    0xA1, 0x01,              # Collection (Application)
    0x85, 0x02,              #   Report ID (2)
    0x15, 0x00, 0x25, 0x01,  #   Logical 0..1
    0x75, 0x01, 0x95, 0x01,  #   1 bit
    0x09, 0x20,              #   Usage (Hook Switch)
    0x81, 0x02,              #   Input (Data, Var, Abs)
    0x95, 0x07, 0x81, 0x03,  #   7 bits padding
    0x85, 0x03,              #   Report ID (3)
    0x05, 0x08,              #   Usage Page (LED)
    0x09, 0x09,              #   Usage (Mute)
    0x95, 0x01, 0x91, 0x02,  #   Output (Data, Var, Abs)
    0x95, 0x07, 0x91, 0x03,  #   7 bits padding
    0xC0,
])

# Each layout is a list of (label, descriptor, numbered) interfaces, listed in the order
# they are created; 'split' deliberately creates the telephony interface first.
LAYOUTS = {
    'numbered': [('led', VENDOR_NUMBERED, True)],
    'unnumbered': [('led', VENDOR_UNNUMBERED, False)],
    'split': [('telephony', TELEPHONY, True), ('led', VENDOR_NUMBERED, True)],
    'wrong': [('telephony', TELEPHONY, True)],
}

COLOR_NAMES = {
    (0xC0, 0x00, 0x00): 'RED (busy)',
    (0xC0, 0xC0, 0x00): 'YELLOW (ringing)',
    (0x00, 0x00, 0xC0): 'BLUE (held)',
    (0x00, 0xC0, 0x00): 'GREEN (available)',
}


def log(message):
    print(f'{time.strftime("%H:%M:%S")}.{int(time.time() * 1000) % 1000:03d} {message}', flush=True)


def create2_event(name, uniq, descriptor):
    return (
        struct.pack('<I', UHID_CREATE2)
        + name.encode()[:127].ljust(128, b'\0')
        + b'fake-ui20bl'.ljust(64, b'\0')
        + uniq.encode()[:63].ljust(64, b'\0')
        + struct.pack('<HHIIII', len(descriptor), BUS_USB, VENDOR_ID, PRODUCT_ID, 0, 0)
        + descriptor.ljust(DATA_MAX, b'\0')
    ).ljust(EVENT_SIZE, b'\0')


def simple_event(event_type):
    return struct.pack('<I', event_type).ljust(EVENT_SIZE, b'\0')


def decode(data, numbered):
    """Describe one output report as Chrome delivered it (report ID byte included)."""
    if not data:
        return 'empty report'
    if not numbered and data[0] == 0x00:
        data = data[1:]  # hidraw's report-number byte for unnumbered devices
    if not data or data[0] != 0x01:
        return f'unexpected report/marker 0x{data[0]:02x} ({len(data)} bytes): {data[:12].hex()}'
    payload = data[1:]
    if payload[:2] == bytes([0x12, 0x02]) and len(payload) >= 9:
        rgb = tuple(payload[2:5])
        if payload[8] == 0x00:
            return f'LED OFF ({len(payload)}-byte payload)'
        name = COLOR_NAMES.get(rgb, 'rgb(%d,%d,%d)' % rgb)
        return f'LED {name} ({len(payload)}-byte payload)'
    if payload[:2] == bytes([0x04, 0x06]):
        return f'ringer volume high ({len(payload)}-byte payload)'
    if payload[:5] == bytes([0x09, 0x04, 0x01, 0x03, 0x01]):
        return f'ringer trigger ({len(payload)}-byte payload)'
    return f'unknown payload ({len(payload)} bytes): {payload[:12].hex()}'


def green_packet(numbered):
    payload = bytes([0x12, 0x02, 0x00, 0xC0, 0x00, 0x00, 0xC0, 0x00, 0x01]).ljust(LED_LENGTH, b'\0')
    # hidraw writes always start with the report number; unnumbered devices take 0x00
    # followed by the full report, in which 0x01 is just the first data byte.
    return bytes([0x01]) + payload if numbered else bytes([0x00, 0x01]) + payload


def find_hidraw(uniq, attempts=30):
    for _ in range(attempts):
        for uevent in glob.glob('/sys/class/hidraw/hidraw*/device/uevent'):
            with open(uevent) as handle:
                if f'HID_UNIQ={uniq}\n' in handle.read():
                    return '/dev/' + uevent.split('/')[4]
        time.sleep(0.1)
    return None


class FakeInterface:
    def __init__(self, label, descriptor, numbered, index):
        self.label = label
        self.numbered = numbered
        self.uniq = f'fake-ui20bl-{os.getpid()}-{index}'
        self.fd = os.open('/dev/uhid', os.O_RDWR)
        os.write(self.fd, create2_event('Sennheiser UI 20 BL USB (fake)', self.uniq, descriptor))
        self.hidraw = find_hidraw(self.uniq)
        if self.hidraw:
            # Chrome runs as the desktop user; udev normally leaves hidraw root-only.
            time.sleep(0.5)
            os.chmod(self.hidraw, 0o666)
        log(f'[{label}] created {self.hidraw or "(hidraw node not found)"}')

    def handle(self):
        event = os.read(self.fd, EVENT_SIZE)
        (event_type,) = struct.unpack_from('<I', event)
        body = event[4:]
        if event_type == UHID_OUTPUT:
            size, rtype = struct.unpack_from('<HB', body, DATA_MAX)
            log(f'[{self.label}] {decode(body[:size], self.numbered)}')
        elif event_type == UHID_SET_REPORT:
            request_id, _rnum, _rtype, size = struct.unpack_from('<IBBH', body)
            log(f'[{self.label}] (SET_REPORT) {decode(body[8:8 + size], self.numbered)}')
            os.write(self.fd, (struct.pack('<IIH', UHID_SET_REPORT_REPLY, request_id, 0)).ljust(EVENT_SIZE, b'\0'))
        elif event_type == UHID_GET_REPORT:
            (request_id,) = struct.unpack_from('<I', body)
            os.write(self.fd, struct.pack('<IIHH', UHID_GET_REPORT_REPLY, request_id, EIO, 0).ljust(EVENT_SIZE, b'\0'))
        elif event_type == UHID_OPEN:
            log(f'[{self.label}] opened by host (Chrome connected)')
        elif event_type == UHID_CLOSE:
            log(f'[{self.label}] closed by host')

    def destroy(self):
        try:
            os.write(self.fd, simple_event(UHID_DESTROY))
        finally:
            os.close(self.fd)


def self_test():
    assert EVENT_SIZE == 4376, EVENT_SIZE
    assert len(create2_event('x', 'y', VENDOR_NUMBERED)) == EVENT_SIZE
    red = bytes([0x01, 0x12, 0x02, 0xC0, 0, 0, 0xC0, 0, 0, 0x01]).ljust(LED_LENGTH + 1, b'\0')
    assert decode(red, True) == 'LED RED (busy) (73-byte payload)', decode(red, True)
    assert decode(b'\0' + red, False).startswith('LED RED (busy)')
    off = bytes([0x01, 0x12, 0x02, 0, 0, 0, 0, 0, 0, 0x00]).ljust(LED_LENGTH + 1, b'\0')
    assert decode(off, True).startswith('LED OFF')
    assert decode(green_packet(True), True).startswith('LED GREEN')
    assert decode(green_packet(False), False).startswith('LED GREEN')
    assert decode(bytes([0x01, 0x09, 0x04, 0x01, 0x03, 0x01]), True).startswith('ringer trigger')
    assert decode(bytes([0x03, 0x01]), True).startswith('unexpected report/marker 0x03')
    print('self-test passed')


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--layout', choices=sorted(LAYOUTS), default='numbered')
    parser.add_argument('--compete', type=float, metavar='SECONDS',
                        help='repaint the light green every SECONDS from a second writer, like EPOS Connect')
    parser.add_argument('--unplug-after', type=float, metavar='SECONDS', help='destroy the device after SECONDS')
    parser.add_argument('--self-test', action='store_true', help='check encoding/decoding without root or a device')
    args = parser.parse_args()

    if args.self_test:
        self_test()
        return
    if os.geteuid() != 0:
        sys.exit('needs root for /dev/uhid (run with sudo), or use --self-test')

    interfaces = [FakeInterface(label, descriptor, numbered, index)
                  for index, (label, descriptor, numbered) in enumerate(LAYOUTS[args.layout])]
    selector = selectors.DefaultSelector()
    for interface in interfaces:
        selector.register(interface.fd, selectors.EVENT_READ, interface)

    led = next((interface for interface in interfaces if interface.label == 'led'), None)
    competitor_fd = None
    next_compete = time.monotonic() + (args.compete or 0)
    unplug_at = time.monotonic() + args.unplug_after if args.unplug_after else None
    log(f'layout={args.layout}; waiting for Chrome. Ctrl+C to stop.')
    try:
        while True:
            for key, _ in selector.select(timeout=0.2):
                key.data.handle()
            now = time.monotonic()
            if args.compete and led and led.hidraw and now >= next_compete:
                next_compete = now + args.compete
                if competitor_fd is None:
                    competitor_fd = os.open(led.hidraw, os.O_WRONLY)
                os.write(competitor_fd, green_packet(led.numbered))
                log('[competitor] repainted GREEN (simulated EPOS Connect)')
            if unplug_at and now >= unplug_at:
                log('unplugging')
                return
    except KeyboardInterrupt:
        pass
    finally:
        if competitor_fd is not None:
            os.close(competitor_fd)
        for interface in interfaces:
            interface.destroy()
        log('virtual device destroyed')


if __name__ == '__main__':
    main()
