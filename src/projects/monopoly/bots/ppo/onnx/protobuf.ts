// ---------------------------------------------------------------------------
// A minimal protocol-buffers WIRE-FORMAT reader — no schema, no codegen, no
// dependency. ONNX models are protobuf, and the alternative (protobufjs, or the
// `onnx-proto` package) drags in a code generator plus a runtime we would then
// have to trust inside the game bundle. The wire format is small enough to own:
// a tag is `(field_number << 3) | wire_type`, and only four wire types survive
// in proto3 (0 varint, 1 fixed64, 2 length-delimited, 5 fixed32).
//
// The reader is deliberately SCHEMA-FREE: callers drive it with a switch on the
// field number. That keeps `model.ts` a direct transcription of `onnx.proto`
// and means an unknown field costs one `skip()` rather than a parse failure —
// which is exactly the forward-compatibility promise protobuf makes, and the
// reason a model exported by a newer ONNX version still loads here.
//
// INT64 IS READ AS A JS `number`, NOT `BigInt`. Every int64 that matters in an
// ONNX graph is a dimension, an axis, an index, or an opset version — all far
// below 2^53, where doubles are exact. BigInt would be exactly correct and
// uniformly slower, and it would force `bigint` into the tensor layer where it
// buys nothing. Values beyond 2^53 silently lose precision; a model that needs
// them is not a model this executor can run anyway.
// ---------------------------------------------------------------------------

/** Wire types. Proto3 dropped 3 (start-group) and 4 (end-group), but a reader
 *  that skips unknown fields must still recognise them to walk past a legacy
 *  group, so `skip()` handles them. */
const WIRE_VARINT = 0;
const WIRE_FIXED64 = 1;
/** Exported because it is the wire type a caller must pass to the `repeated*`
 *  readers to select the PACKED form. */
export const WIRE_LENGTH_DELIMITED = 2;
const WIRE_START_GROUP = 3;
const WIRE_END_GROUP = 4;
const WIRE_FIXED32 = 5;

/** 2^32, the multiplier that recombines two 32-bit halves into a double. */
const TWO_32 = 4294967296;

const TEXT_DECODER = new TextDecoder("utf-8");

/**
 * A cursor over a byte range. Instances are cheap (three fields), which lets
 * nested messages be parsed by handing a sub-reader to a sub-parser instead of
 * copying the bytes — important when the "sub-message" is a 13 MB initializer
 * list.
 */
export class ProtoReader {
  readonly bytes: Uint8Array;
  /** Cursor, absolute into `bytes`. */
  pos: number;
  /** One past the last readable byte. Sub-readers narrow this, not the array. */
  readonly end: number;
  private readonly view: DataView;

  constructor(bytes: Uint8Array, start = 0, end = bytes.length) {
    this.bytes = bytes;
    this.pos = start;
    this.end = end;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  /** True while a field remains in this message's range. The canonical loop is
   *  `while (r.hasMore()) { const t = r.tag(); switch (t.field) { ... } }`. */
  hasMore(): boolean {
    return this.pos < this.end;
  }

  /** Read a field tag, splitting it into field number and wire type. */
  tag(): { field: number; wire: number } {
    const key = this.uint32();
    return { field: key >>> 3, wire: key & 0x07 };
  }

  /**
   * Read a base-128 varint spanning up to ten bytes and return it interpreted
   * as a SIGNED int64.
   *
   * The ten-byte case is the one that trips naive readers: protobuf encodes a
   * negative int32/int64 by sign-extending to 64 bits first, so `-1` is ten
   * bytes of `0xff … 0x01`, not one byte. A reader that accumulates into a
   * single JS number with `<<` wraps at 32 bits and yields garbage. Splitting
   * into two 32-bit halves and doing the two's-complement negation on the
   * halves keeps the result exact for the whole ±2^53 range.
   */
  varint(): number {
    let lo = 0;
    let hi = 0;
    let shift = 0;
    for (let i = 0; i < 10; i++) {
      if (this.pos >= this.end) throw new Error("protobuf: varint runs past end of buffer");
      const b = this.bytes[this.pos++];
      if (shift < 28) {
        lo |= (b & 0x7f) << shift;
      } else if (shift === 28) {
        // This byte straddles the 32-bit boundary: 4 bits finish `lo`, 3 start `hi`.
        lo |= (b & 0x0f) << 28;
        hi |= (b & 0x7f) >>> 4;
      } else {
        hi |= (b & 0x7f) << (shift - 32);
      }
      shift += 7;
      if ((b & 0x80) === 0) break;
    }
    lo = lo >>> 0;
    hi = hi >>> 0;
    if ((hi & 0x80000000) !== 0) {
      // Negative: negate the 64-bit magnitude via ~x + 1 across both halves.
      let nlo = (~lo >>> 0) + 1;
      let nhi = ~hi >>> 0;
      if (nlo > 0xffffffff) {
        nlo = 0;
        nhi = (nhi + 1) >>> 0;
      }
      return -(nhi * TWO_32 + nlo);
    }
    return hi * TWO_32 + lo;
  }

  /**
   * A varint known to be unsigned and to fit in 32 bits (tags, enum values,
   * `data_type`, and every length-delimited field's LENGTH). Faster than
   * `varint()` and cannot produce a negative.
   *
   * The fifth byte carries bits 28-31 and must be taken, not skipped: a
   * `raw_data` blob of 2^28 bytes or more encodes its length in five bytes, and
   * dropping the top group decodes it 256 MiB short — after which the cursor
   * lands mid-payload and the whole parse desynchronises into nonsense rather
   * than an error. Bits at and above 32 are discarded, which is what makes this
   * a uint32 reader rather than `varint()`.
   */
  uint32(): number {
    let value = 0;
    let shift = 0;
    for (;;) {
      if (this.pos >= this.end) throw new Error("protobuf: varint runs past end of buffer");
      const b = this.bytes[this.pos++];
      if (shift < 28) {
        value |= (b & 0x7f) << shift;
      } else if (shift === 28) {
        value |= (b & 0x0f) << 28;
      }
      shift += 7;
      if ((b & 0x80) === 0) break;
      if (shift > 70) throw new Error("protobuf: varint longer than 10 bytes");
    }
    return value >>> 0;
  }

  /** A varint holding a value declared `int32` in the schema. Negative int32s
   *  are sign-extended to ten bytes on the wire, so this must go through the
   *  full 64-bit path and then truncate. */
  int32(): number {
    return this.varint() | 0;
  }

  /** Signed 64-bit fixed (`sfixed64`) / unsigned (`fixed64`) — recombined from
   *  halves for the same reason `varint()` is. */
  fixed64(): number {
    this.require(8);
    const lo = this.view.getUint32(this.pos, true);
    const hi = this.view.getUint32(this.pos + 4, true);
    this.pos += 8;
    return hi * TWO_32 + lo;
  }

  fixed32(): number {
    this.require(4);
    const v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }

  float(): number {
    this.require(4);
    const v = this.view.getFloat32(this.pos, true);
    this.pos += 4;
    return v;
  }

  double(): number {
    this.require(8);
    const v = this.view.getFloat64(this.pos, true);
    this.pos += 8;
    return v;
  }

  /** A length-delimited payload, returned as a VIEW (`subarray`) rather than a
   *  copy. `raw_data` for a 3.4M-parameter model is 13 MB; copying it here and
   *  again into the typed array would triple peak memory for no benefit. */
  bytesField(): Uint8Array {
    const len = this.uint32();
    this.require(len);
    const out = this.bytes.subarray(this.pos, this.pos + len);
    this.pos += len;
    return out;
  }

  string(): string {
    return TEXT_DECODER.decode(this.bytesField());
  }

  /** A nested message, as a reader scoped to its bytes. */
  message(): ProtoReader {
    const len = this.uint32();
    this.require(len);
    const sub = new ProtoReader(this.bytes, this.pos, this.pos + len);
    this.pos += len;
    return sub;
  }

  /**
   * Read a repeated numeric field into `out`, transparently handling BOTH
   * encodings.
   *
   * This is the subtlety that breaks hand-rolled ONNX readers. proto3 defaults
   * scalar repeated fields to PACKED (one length-delimited blob of
   * back-to-back varints), but the encoder is free to emit the UNPACKED form
   * (the tag repeated before every element), and a conforming reader must
   * accept either — for the *same* field, even interleaved. Exporters do use
   * both: PyTorch's ONNX exporter packs `dims`, while some graph-surgery tools
   * rewrite them unpacked. Dispatching on the observed wire type rather than
   * the schema's declared one is what makes both load.
   */
  repeatedVarint(wire: number, out: number[]): void {
    if (wire === WIRE_LENGTH_DELIMITED) {
      const len = this.uint32();
      this.require(len);
      const stop = this.pos + len;
      while (this.pos < stop) out.push(this.varint());
    } else {
      out.push(this.varint());
    }
  }

  /** Packed-or-unpacked repeated `float`, appended to `out`. */
  repeatedFloat(wire: number, out: number[]): void {
    if (wire === WIRE_LENGTH_DELIMITED) {
      const len = this.uint32();
      this.require(len);
      const stop = this.pos + len;
      while (this.pos < stop) out.push(this.float());
    } else {
      out.push(this.float());
    }
  }

  /** Packed-or-unpacked repeated `double`. */
  repeatedDouble(wire: number, out: number[]): void {
    if (wire === WIRE_LENGTH_DELIMITED) {
      const len = this.uint32();
      this.require(len);
      const stop = this.pos + len;
      while (this.pos < stop) out.push(this.double());
    } else {
      out.push(this.double());
    }
  }

  /**
   * Walk past a field whose number we do not recognise. Skipping rather than
   * failing is what lets a model exported by a newer ONNX release load: new
   * fields are additive, and a field we ignore is by construction one whose
   * absence the graph semantics do not depend on.
   */
  skip(wire: number): void {
    switch (wire) {
      case WIRE_VARINT:
        this.varint();
        return;
      case WIRE_FIXED64:
        this.require(8);
        this.pos += 8;
        return;
      case WIRE_LENGTH_DELIMITED: {
        const len = this.uint32();
        this.require(len);
        this.pos += len;
        return;
      }
      case WIRE_START_GROUP: {
        // Groups are proto2-only and long deprecated, but a nested unknown
        // group must still be walked as a unit — recurse until its END_GROUP.
        for (;;) {
          const t = this.tag();
          if (t.wire === WIRE_END_GROUP) return;
          this.skip(t.wire);
        }
      }
      case WIRE_FIXED32:
        this.require(4);
        this.pos += 4;
        return;
      default:
        throw new Error(`protobuf: unknown wire type ${wire}`);
    }
  }

  private require(n: number): void {
    if (n < 0 || this.pos + n > this.end) {
      throw new Error(`protobuf: field of ${n} bytes runs past end of buffer`);
    }
  }
}
