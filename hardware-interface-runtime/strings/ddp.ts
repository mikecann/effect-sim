// DDP (Distributed Display Protocol) packets for WLED. A frame bigger than
// one packet's worth (480 RGB LEDs) goes out in 1440-byte chunks, each with
// its byte offset; only the last one has PUSH, so WLED shows the frame once
// it has all of it.

export const DDP_HEADER_BYTES = 10;
/** 480 LEDs of RGB: keeps every packet under a 1500-byte Ethernet MTU. */
export const DDP_MAX_DATA_BYTES = 1440;

const VERSION_1 = 0x40; // version 1 in the high nibble of byte 0
const FLAG_PUSH = 0x01;
const DATA_TYPE_RGB = 0x01;
const OUTPUT_ID = 0x01;

/**
 * Turns RGB frames into DDP packets, reusing the same buffers frame after
 * frame (they're rebuilt only when the frame's length changes). The packets
 * it returns are valid until the next call.
 */
export class DdpPacketizer {
  private packets: Buffer[] = [];
  private frameBytes = -1;

  pack(rgb: Uint8Array): readonly Buffer[] {
    if (rgb.length !== this.frameBytes) this.allocate(rgb.length);
    for (let i = 0; i < this.packets.length; i++) {
      const offset = i * DDP_MAX_DATA_BYTES;
      const end = Math.min(offset + DDP_MAX_DATA_BYTES, rgb.length);
      this.packets[i].set(rgb.subarray(offset, end), DDP_HEADER_BYTES);
    }
    return this.packets;
  }

  private allocate(frameBytes: number) {
    this.frameBytes = frameBytes;
    const count = Math.max(1, Math.ceil(frameBytes / DDP_MAX_DATA_BYTES));
    this.packets = Array.from({ length: count }, (_, i) => {
      const offset = i * DDP_MAX_DATA_BYTES;
      const length = Math.min(DDP_MAX_DATA_BYTES, frameBytes - offset);
      const last = i === count - 1;
      const packet = Buffer.alloc(DDP_HEADER_BYTES + length);
      packet[0] = VERSION_1 | (last ? FLAG_PUSH : 0);
      packet[1] = 0x00; // sequence number: unused
      packet[2] = DATA_TYPE_RGB;
      packet[3] = OUTPUT_ID;
      packet.writeUInt32BE(offset, 4);
      packet.writeUInt16BE(length, 8);
      return packet;
    });
  }
}
