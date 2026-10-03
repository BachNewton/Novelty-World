/*

  ZzFXM - ZzFX Music Renderer v2.0.3 by Keith Clark and Frank Force
  https://github.com/keithclark/ZzFXM

  Ported to TypeScript for Frogmino. ZzFXM has no npm package, and its one
  file assigns a global and reads ZzFX's from globals, so it is vendored as
  this port: ZzFX's sample builder and sample rate are passed in, a pattern
  without a channel is silent in it, and the channels come back as
  Float32Arrays. The song format and the mixing are ZzFXM's own.

  MIT License

  Copyright (c) 2020 Keith Clark

  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all
  copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
  SOFTWARE.

*/

// A channel of a pattern: its instrument, its panning (-1 left to 1 right),
// then one note per row. A note's whole part is its pitch, 1 to 36, where 12
// is the instrument's own frequency; its fraction is how far it is turned
// down. 0 is a rest, which lets the playing note ring on, and -1 releases it.
export type ZzfxmChannel = number[];
export type ZzfxmPattern = ZzfxmChannel[];

// ZzFXM's song: instruments as ZzFX parameter arrays, the patterns, the order
// they play in, and the speed in beats per minute, four rows to the beat.
export type ZzfxmSong = [instruments: number[][], patterns: ZzfxmPattern[], sequence: number[], bpm: number];

// A note stopping fades out over this many samples at the end of its last
// row, so it doesn't click.
const FADE_SAMPLES = 99;

interface Row {
  instrument: number;
  panning: number;
  note: number;
}

export function rowSamples(bpm: number, sampleRate: number): number {
  return Math.floor(((sampleRate / bpm) * 60) / 4);
}

// One channel's rows across the whole sequence. Every pattern is as long as
// its first channel.
function channelRows([, patterns, sequence]: ZzfxmSong, channel: number): Row[] {
  return sequence.flatMap((index) => {
    const pattern = patterns[index];
    const length = pattern[0].length - 2;
    const line = pattern.at(channel);
    return Array.from({ length }, (_, row): Row => {
      if (line === undefined) return { instrument: 0, panning: 0, note: row === 0 ? -1 : 0 };
      return { instrument: line[0], panning: line[1], note: line.at(row + 2) ?? 0 };
    });
  });
}

// Renders a song to its left and right channels. `build` is ZzFX's sample
// builder; each instrument's note is built once and reused.
export function zzfxm(
  song: ZzfxmSong,
  sampleRate: number,
  build: (params: number[]) => number[],
): [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>] {
  const [instruments, patterns, sequence, bpm] = song;
  const beat = rowSamples(bpm, sampleRate);
  const rowCount = sequence.reduce((rows, index) => rows + patterns[index][0].length - 2, 0);
  const left = new Float32Array(rowCount * beat);
  const right = new Float32Array(rowCount * beat);
  const cache = new Map<string, number[]>();
  const built = (instrument: number, note: number): number[] => {
    const key = `${instrument},${note}`;
    let samples = cache.get(key);
    if (samples === undefined) {
      const params = [...instruments[instrument]];
      params[2] *= 2 ** ((note - 12) / 12);
      samples = build(params);
      cache.set(key, samples);
    }
    return samples;
  };
  const channelCount = Math.max(...sequence.map((index) => patterns[index].length));

  for (let channel = 0; channel < channelCount; channel++) {
    const rows = channelRows(song, channel);
    let samples: number[] = [];
    let position = 0;
    let attenuation = 0;
    let panning = 0;
    let playing: number | null = null;
    let out = 0;
    rows.forEach(({ instrument, panning: rowPanning, note }, r) => {
      if (note !== 0) {
        attenuation = note % 1;
        panning = rowPanning;
        const pitch = Math.trunc(note);
        if (pitch !== 0) {
          playing = instrument;
          samples = pitch > 0 ? built(instrument, pitch) : [];
          position = 0;
        }
      }
      // The note stops at the end of this row if the next row plays a note
      // or changes instrument, or this is the song's last row.
      const next = rows.at(r + 1);
      const stop = next === undefined || next.note !== 0 || next.instrument !== playing;
      for (let j = 0; j < beat; j++, out++) {
        const sample = position < samples.length ? ((1 - attenuation) * samples[position]) / 2 : 0;
        position++;
        left[out] += sample - sample * panning;
        right[out] += sample + sample * panning;
        if (stop && j > beat - FADE_SAMPLES && attenuation < 1) attenuation += 1 / FADE_SAMPLES;
      }
    });
  }
  return [left, right];
}
