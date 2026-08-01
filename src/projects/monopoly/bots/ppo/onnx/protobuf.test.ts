// Unit tests for the hand-rolled protobuf WIRE reader.
//
// Every buffer here is a literal byte array with the encoding spelled out in a
// comment, so the expectations are readable against the protobuf spec rather
// than against any encoder. The cases that earn their keep are the ones a naive
// reader gets wrong: the ten-byte sign-extended negative varint, values above
// 2^32, and a repeated field that arrives packed in one place and unpacked in
// another.

import { describe, expect, it } from "vitest";
import { ProtoReader } from "./protobuf";

/** Shorthand so the byte literals stay on one line. */
function buf(...bytes: number[]): Uint8Array {
  return new Uint8Array(bytes);
}

describe("varint", () => {
  it("reads a single-byte value", () => {
    // 0x01 -> 1 ; 0x7f -> 127 (largest one-byte varint)
    expect(new ProtoReader(buf(0x01)).varint()).toBe(1);
    expect(new ProtoReader(buf(0x7f)).varint()).toBe(127);
    expect(new ProtoReader(buf(0x00)).varint()).toBe(0);
  });

  it("reads a multi-byte value, low group first", () => {
    // 150 = 0b10010110 -> groups 0010110 , 0000001 -> 0x96 0x01
    expect(new ProtoReader(buf(0x96, 0x01)).varint()).toBe(150);
    // 300 = 0b100101100 -> groups 0101100 , 0000010 -> 0xac 0x02
    expect(new ProtoReader(buf(0xac, 0x02)).varint()).toBe(300);
    // 128 -> groups 0000000 , 0000001
    expect(new ProtoReader(buf(0x80, 0x01)).varint()).toBe(128);
  });

  // THE case that breaks readers accumulating into one 32-bit JS int: protobuf
  // sign-extends a negative to 64 bits before encoding, so -1 is ten bytes of
  // 0xff...0x01 and a `<<`-based accumulator wraps at 32 bits into garbage.
  it("reads a ten-byte sign-extended negative as exactly that negative", () => {
    expect(new ProtoReader(buf(0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01)).varint()).toBe(-1);
    expect(new ProtoReader(buf(0xfe, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01)).varint()).toBe(-2);
    // -300: two's complement 64-bit is 0xFFFF_FFFF_FFFF_FED4, whose low groups
    // are 1010100 (0xd4) then 1111101 (0xfd), then all-ones to the end.
    expect(new ProtoReader(buf(0xd4, 0xfd, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01)).varint()).toBe(-300);
  });

  it("recombines the two 32-bit halves for a value above 2^32", () => {
    // 2^33 = 8589934592. Only bit 33 is set, which lands in group 5 (bits
    // 28..34) as 0b0100000 = 0x20 — i.e. entirely in the HIGH half.
    expect(new ProtoReader(buf(0x80, 0x80, 0x80, 0x80, 0x20)).varint()).toBe(8589934592);
  });

  it("advances the cursor by exactly the bytes consumed", () => {
    const r = new ProtoReader(buf(0x96, 0x01, 0x07));
    expect(r.varint()).toBe(150);
    expect(r.pos).toBe(2);
    expect(r.varint()).toBe(7);
    expect(r.hasMore()).toBe(false);
  });

  it("throws rather than reading past the end of a truncated varint", () => {
    // Every byte has the continuation bit set, so the value never terminates.
    expect(() => new ProtoReader(buf(0x80, 0x80)).varint()).toThrow(/runs past end of buffer/);
  });
});

describe("uint32", () => {
  it("reads an unsigned varint below 2^28", () => {
    expect(new ProtoReader(buf(0x96, 0x01)).uint32()).toBe(150);
    // 2^28 - 1 = 0x0FFFFFFF, the largest value that fits in four 7-bit groups.
    expect(new ProtoReader(buf(0xff, 0xff, 0xff, 0x7f)).uint32()).toBe(268435455);
  });

  // ENGINE BUG. `uint32()` is documented as "a varint known to be unsigned and
  // to fit in 32 bits", but its accumulator only consumes groups while
  // `shift < 28`, so the fifth group — bits 28..31 — is read past and DISCARDED.
  // It is the reader for every length-delimited field's length, so a `raw_data`
  // blob of 2^28 bytes or more decodes with a length short by 2^28 and the
  // parse silently desynchronises rather than failing.
  it("reads an unsigned varint at or above 2^28", () => {
    // 0xFFFFFFFF encoded as four full groups plus 0b1111 in the fifth.
    expect(new ProtoReader(buf(0xff, 0xff, 0xff, 0xff, 0x0f)).uint32()).toBe(4294967295);
    // 2^28 exactly: only the fifth group is non-zero.
    expect(new ProtoReader(buf(0x80, 0x80, 0x80, 0x80, 0x01)).uint32()).toBe(268435456);
  });

  it("still advances the cursor correctly past a five-byte varint", () => {
    // Even where the VALUE is truncated, the cursor must land on the next tag —
    // the loop terminates on the continuation bit, not on the shift count.
    const r = new ProtoReader(buf(0xff, 0xff, 0xff, 0xff, 0x0f, 0x10, 0x07));
    r.uint32();
    expect(r.pos).toBe(5);
    expect(r.tag()).toEqual({ field: 2, wire: 0 });
  });

  it("throws on truncated input", () => {
    expect(() => new ProtoReader(buf(0x80)).uint32()).toThrow(/runs past end of buffer/);
  });
});

describe("int32", () => {
  // A schema-declared int32 holding a negative still arrives sign-extended to
  // ten bytes, so the reader must take the full 64-bit path and then truncate.
  it("reads a sign-extended negative int32 back as the negative", () => {
    expect(new ProtoReader(buf(0xfb, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01)).int32()).toBe(-5);
    expect(new ProtoReader(buf(0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01)).int32()).toBe(-1);
  });

  it("reads a small positive int32 unchanged", () => {
    expect(new ProtoReader(buf(0x0a)).int32()).toBe(10);
  });
});

describe("fixed-width fields", () => {
  it("reads fixed32 little-endian", () => {
    // 0x01020304 stored low byte first.
    expect(new ProtoReader(buf(0x04, 0x03, 0x02, 0x01)).fixed32()).toBe(16909060);
  });

  it("reads fixed64 by recombining halves", () => {
    // lo = 0, hi = 1 -> 1 * 2^32
    expect(new ProtoReader(buf(0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00)).fixed64()).toBe(4294967296);
  });

  it("reads a float", () => {
    // 1.5f = 0x3FC00000, little-endian.
    expect(new ProtoReader(buf(0x00, 0x00, 0xc0, 0x3f)).float()).toBe(1.5);
    // -2.5f = 0xC0200000
    expect(new ProtoReader(buf(0x00, 0x00, 0x20, 0xc0)).float()).toBe(-2.5);
  });

  it("reads a double", () => {
    // 1.5 = 0x3FF8000000000000, little-endian.
    expect(new ProtoReader(buf(0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xf8, 0x3f)).double()).toBe(1.5);
  });

  it("throws when a fixed field runs past the end", () => {
    expect(() => new ProtoReader(buf(0x01, 0x02)).fixed32()).toThrow(/runs past end of buffer/);
    expect(() => new ProtoReader(buf(0x01, 0x02, 0x03, 0x04)).fixed64()).toThrow(/runs past end of buffer/);
  });
});

describe("length-delimited fields", () => {
  it("decodes a UTF-8 string including multi-byte characters", () => {
    // len=6, then "héllo": 0x68, 0xc3 0xa9 (é), 0x6c, 0x6c, 0x6f
    const r = new ProtoReader(buf(0x06, 0x68, 0xc3, 0xa9, 0x6c, 0x6c, 0x6f));
    expect(r.string()).toBe("héllo");
    expect(r.hasMore()).toBe(false);
  });

  it("decodes an empty string", () => {
    expect(new ProtoReader(buf(0x00)).string()).toBe("");
  });

  // The 13 MB `raw_data` of a real model must not be copied here; returning a
  // subarray is what keeps peak memory at one copy rather than three.
  it("bytesField returns a VIEW over the original buffer, not a copy", () => {
    const src = buf(0x03, 0x0a, 0x0b, 0x0c, 0xff);
    const r = new ProtoReader(src);
    const view = r.bytesField();
    expect(Array.from(view)).toEqual([0x0a, 0x0b, 0x0c]);
    expect(view.buffer).toBe(src.buffer);
    expect(view.byteOffset).toBe(1);
    expect(r.pos).toBe(4);
  });

  it("throws when the declared length runs past the end", () => {
    expect(() => new ProtoReader(buf(0x08, 0x01, 0x02)).bytesField()).toThrow(/runs past end of buffer/);
  });
});

describe("tag", () => {
  it("splits the key into field number and wire type", () => {
    // 0x2a = 42 = (5 << 3) | 2
    expect(new ProtoReader(buf(0x2a)).tag()).toEqual({ field: 5, wire: 2 });
    // 0x08 = (1 << 3) | 0
    expect(new ProtoReader(buf(0x08)).tag()).toEqual({ field: 1, wire: 0 });
    // 0x0d = (1 << 3) | 5
    expect(new ProtoReader(buf(0x0d)).tag()).toEqual({ field: 1, wire: 5 });
  });

  it("handles a multi-byte tag for a high field number", () => {
    // field 300, wire 0 -> key 2400 -> varint 0xe0 0x12
    expect(new ProtoReader(buf(0xe0, 0x12)).tag()).toEqual({ field: 300, wire: 0 });
  });
});

describe("repeated fields", () => {
  it("reads the PACKED form (wire type 2) as one blob of varints", () => {
    const out: number[] = [];
    // len=3 then 1,2,3
    new ProtoReader(buf(0x03, 0x01, 0x02, 0x03)).repeatedVarint(2, out);
    expect(out).toEqual([1, 2, 3]);
  });

  it("reads the UNPACKED form (wire type 0) as a single element", () => {
    const out: number[] = [];
    new ProtoReader(buf(0x2a)).repeatedVarint(0, out);
    expect(out).toEqual([42]);
  });

  // A conforming reader must accept both encodings for the SAME field, because
  // exporters and graph-surgery tools disagree about which to emit and a model
  // can legitimately carry a mix.
  it("accumulates packed and unpacked occurrences of one field into one array", () => {
    // field 1 packed [1,2] | field 1 unpacked 3 | field 1 packed [4]
    const r = new ProtoReader(buf(0x0a, 0x02, 0x01, 0x02, 0x08, 0x03, 0x0a, 0x01, 0x04));
    const dims: number[] = [];
    while (r.hasMore()) {
      const { field, wire } = r.tag();
      if (field === 1) r.repeatedVarint(wire, dims);
      else r.skip(wire);
    }
    expect(dims).toEqual([1, 2, 3, 4]);
  });

  it("reads packed and unpacked repeated floats", () => {
    const packed: number[] = [];
    // len=8 then 1.5f, -2.5f
    new ProtoReader(buf(0x08, 0x00, 0x00, 0xc0, 0x3f, 0x00, 0x00, 0x20, 0xc0)).repeatedFloat(2, packed);
    expect(packed).toEqual([1.5, -2.5]);

    const single: number[] = [];
    new ProtoReader(buf(0x00, 0x00, 0x00, 0x3f)).repeatedFloat(5, single);
    expect(single).toEqual([0.5]);
  });

  it("reads packed and unpacked repeated doubles", () => {
    const packed: number[] = [];
    // len=8 then 1.5
    new ProtoReader(buf(0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xf8, 0x3f)).repeatedDouble(2, packed);
    expect(packed).toEqual([1.5]);

    const single: number[] = [];
    new ProtoReader(buf(0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xd0, 0xbf)).repeatedDouble(1, single);
    expect(single).toEqual([-0.25]);
  });
});

describe("skip", () => {
  /** Skip one field of `wire`, then read the sentinel field that follows. The
   *  sentinel proves the cursor landed EXACTLY on the next tag. */
  function skipThenSentinel(bytes: Uint8Array, wire: number): { field: number; value: number } {
    const r = new ProtoReader(bytes);
    r.skip(wire);
    const t = r.tag();
    return { field: t.field, value: r.varint() };
  }

  it("walks past a varint", () => {
    // 0x96 0x01 (=150), then field 2 varint 7
    expect(skipThenSentinel(buf(0x96, 0x01, 0x10, 0x07), 0)).toEqual({ field: 2, value: 7 });
  });

  it("walks past a fixed64", () => {
    expect(
      skipThenSentinel(buf(0, 0, 0, 0, 0, 0, 0, 0, 0x10, 0x07), 1),
    ).toEqual({ field: 2, value: 7 });
  });

  it("walks past a length-delimited payload", () => {
    // len=3 then three bytes, then field 2 varint 7
    expect(skipThenSentinel(buf(0x03, 0xaa, 0xbb, 0xcc, 0x10, 0x07), 2)).toEqual({ field: 2, value: 7 });
  });

  it("walks past a fixed32", () => {
    expect(skipThenSentinel(buf(0, 0, 0, 0, 0x10, 0x07), 5)).toEqual({ field: 2, value: 7 });
  });

  // Groups are proto2-only, but an unknown group must still be walked as a UNIT
  // (including nested groups) or the cursor lands mid-message.
  it("walks past a group, including a nested one", () => {
    // inner content: field 1 varint 5 (0x08 0x05)
    //                field 2 START_GROUP (0x13) ... field 2 END_GROUP (0x14)
    //                field 3 varint 9 (0x18 0x09)
    // then END_GROUP for the outer group (0x0c = field 1 wire 4)
    // then the sentinel field 2 varint 7
    const bytes = buf(0x08, 0x05, 0x13, 0x14, 0x18, 0x09, 0x0c, 0x10, 0x07);
    expect(skipThenSentinel(bytes, 3)).toEqual({ field: 2, value: 7 });
  });

  it("rejects a wire type that does not exist", () => {
    expect(() => new ProtoReader(buf(0x00)).skip(6)).toThrow(/unknown wire type 6/);
    expect(() => new ProtoReader(buf(0x00)).skip(7)).toThrow(/unknown wire type 7/);
  });

  it("throws instead of skipping past the end of the buffer", () => {
    expect(() => new ProtoReader(buf(0x09, 0x01)).skip(2)).toThrow(/runs past end of buffer/);
  });
});

describe("message", () => {
  // A sub-reader must be bounded by the SUB-MESSAGE, not the buffer: otherwise
  // a `while (sub.hasMore())` loop keeps parsing the parent's remaining fields
  // as if they belonged to the child.
  it("returns a reader scoped to the sub-message", () => {
    // sub-message len=2 containing field 1 varint 5, then field 2 varint 7 in
    // the PARENT.
    const r = new ProtoReader(buf(0x02, 0x08, 0x05, 0x10, 0x07));
    const sub = r.message();
    expect(sub.hasMore()).toBe(true);
    expect(sub.tag()).toEqual({ field: 1, wire: 0 });
    expect(sub.varint()).toBe(5);
    expect(sub.hasMore()).toBe(false);
    expect(sub.end).toBe(3);

    // The parent cursor sits right after the sub-message.
    expect(r.pos).toBe(3);
    expect(r.tag()).toEqual({ field: 2, wire: 0 });
    expect(r.varint()).toBe(7);
  });

  it("returns an empty reader for a zero-length sub-message", () => {
    const sub = new ProtoReader(buf(0x00, 0xff)).message();
    expect(sub.hasMore()).toBe(false);
  });

  it("throws when the sub-message length runs past the end", () => {
    expect(() => new ProtoReader(buf(0x05, 0x01)).message()).toThrow(/runs past end of buffer/);
  });
});

describe("sub-range construction", () => {
  it("honours an explicit start and end", () => {
    const r = new ProtoReader(buf(0xaa, 0x08, 0x05, 0xbb), 1, 3);
    expect(r.tag()).toEqual({ field: 1, wire: 0 });
    expect(r.varint()).toBe(5);
    expect(r.hasMore()).toBe(false);
  });
});
