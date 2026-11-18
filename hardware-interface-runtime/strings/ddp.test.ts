// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DDP_HEADER_BYTES, DDP_MAX_DATA_BYTES, DdpPacketizer } from "./ddp";

const frame = (leds: number) =>
  Uint8Array.from({ length: leds * 3 }, (_, i) => i % 251);

const header = (packet: Buffer) => ({
  flags: packet[0],
  type: packet[2],
  id: packet[3],
  offset: packet.readUInt32BE(4),
  length: packet.readUInt16BE(8),
});

describe("DDP packets", () => {
  it("sends a small frame as one packet with PUSH", () => {
    const packets = new DdpPacketizer().pack(frame(100));
    expect(packets).toHaveLength(1);
    expect(header(packets[0])).toEqual({
      flags: 0x41,
      type: 0x01,
      id: 0x01,
      offset: 0,
      length: 300,
    });
    expect(packets[0].length).toBe(DDP_HEADER_BYTES + 300);
    expect([...packets[0].subarray(DDP_HEADER_BYTES)]).toEqual([...frame(100)]);
  });

  it("fills exactly one packet at 480 LEDs", () => {
    const packets = new DdpPacketizer().pack(frame(480));
    expect(packets).toHaveLength(1);
    expect(header(packets[0]).length).toBe(DDP_MAX_DATA_BYTES);
  });

  it("splits frames over 480 LEDs into 1440-byte chunks with offsets, PUSH only on the last", () => {
    const rgb = frame(1000); // 3000 bytes: 1440 + 1440 + 120
    const packets = new DdpPacketizer().pack(rgb);
    expect(packets.map(header)).toEqual([
      { flags: 0x40, type: 1, id: 1, offset: 0, length: 1440 },
      { flags: 0x40, type: 1, id: 1, offset: 1440, length: 1440 },
      { flags: 0x41, type: 1, id: 1, offset: 2880, length: 120 },
    ]);
    const joined = Buffer.concat(
      packets.map((p) => p.subarray(DDP_HEADER_BYTES)),
    );
    expect([...joined]).toEqual([...rgb]);
    for (const p of packets)
      expect(p.length).toBeLessThanOrEqual(DDP_HEADER_BYTES + 1440);
  });

  it("reuses its buffers frame to frame, and rebuilds them when the length changes", () => {
    const packetizer = new DdpPacketizer();
    const first = packetizer.pack(frame(600));
    const firstBuffers = [...first];
    const next = frame(600).map((v) => 255 - v);
    const second = packetizer.pack(next);
    expect(second[0]).toBe(firstBuffers[0]);
    expect(second[1]).toBe(firstBuffers[1]);
    expect(second[1][DDP_HEADER_BYTES]).toBe(next[1440]);

    const longer = packetizer.pack(frame(1200));
    expect(longer).toHaveLength(3);
    expect(header(longer[2])).toMatchObject({ flags: 0x41, offset: 2880 });
    expect(header(longer[1])).toMatchObject({ flags: 0x40, length: 1440 });
  });
});
