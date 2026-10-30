// One Freeverb channel: parallel combs make the room's many echoes, and
// allpasses smear them into a wash.
export class Room {
  private readonly combs: { line: Float32Array; at: number; low: number }[];
  private readonly passes: { line: Float32Array; at: number }[];
  private readonly feedback: number;
  private readonly damp: number;

  constructor(size: number, spread: number, sampleRate: number, damp = 0.25) {
    this.damp = damp;
    const scale = sampleRate / 44100;
    const line = (tuning: number): Float32Array => new Float32Array(Math.round((tuning + spread) * scale));
    this.combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((tuning) => ({ line: line(tuning), at: 0, low: 0 }));
    this.passes = [556, 441, 341, 225].map((tuning) => ({ line: line(tuning), at: 0 }));
    this.feedback = 0.7 + size * 0.28;
  }

  process(input: Float32Array, out: Float32Array, wet: number): void {
    const { damp } = this;
    for (let i = 0; i < input.length; i++) {
      let sum = 0;
      for (const comb of this.combs) {
        const delayed = comb.line[comb.at];
        comb.low = delayed * (1 - damp) + comb.low * damp;
        comb.line[comb.at] = input[i] * 0.015 + comb.low * this.feedback;
        comb.at = (comb.at + 1) % comb.line.length;
        sum += delayed;
      }
      for (const pass of this.passes) {
        const delayed = pass.line[pass.at];
        const through = delayed - sum;
        pass.line[pass.at] = sum + delayed * 0.5;
        pass.at = (pass.at + 1) % pass.line.length;
        sum = through;
      }
      out[i] += sum * wet;
    }
  }
}

export interface Rendered {
  left: Float32Array<ArrayBuffer>;
  right: Float32Array<ArrayBuffer>;
  sampleRate: number;
}
