// A measure of whine: a thin, sustained, narrow-band tone high in the spectrum.
// Claude can't hear one, so it is counted: in the held part of a note, how much
// of a note's own loudest moment is left in the single strongest narrow band
// above `FROM_HZ`, and where the sound's weight sits.

const WINDOW = 8192;
const FROM_HZ = 2000;
// A narrow band is about a tone wide at 2 kHz.
const BAND_HZ = 110;
// Bands this far apart in the loudness of the peak moment are the attack's.
const LOUDEST_STEP = 2048;

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const angle = (-2 * Math.PI) / size;
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < size / 2; k++) {
        const wr = Math.cos(angle * k);
        const wi = Math.sin(angle * k);
        const a = start + k;
        const b = a + size / 2;
        const tr = re[b] * wr - im[b] * wi;
        const ti = re[b] * wi + im[b] * wr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
      }
    }
  }
}

// The energy at each frequency bin of a Hann-windowed stretch, starting at `from`.
function powerSpectrum(samples: Float32Array, from: number): Float64Array {
  const re = new Float64Array(WINDOW);
  const im = new Float64Array(WINDOW);
  for (let i = 0; i < WINDOW; i++) re[i] = (from + i < samples.length ? samples[from + i] : 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / WINDOW));
  fft(re, im);
  const power = new Float64Array(WINDOW / 2);
  for (let i = 0; i < power.length; i++) power[i] = re[i] * re[i] + im[i] * im[i];
  return power;
}

function loudestEnergy(samples: Float32Array): number {
  let most = 0;
  for (let from = 0; from + LOUDEST_STEP <= samples.length; from += LOUDEST_STEP) {
    let energy = 0;
    for (let i = from; i < from + LOUDEST_STEP; i++) energy += samples[i] * samples[i];
    most = Math.max(most, energy / LOUDEST_STEP);
  }
  return most;
}

export interface WhineReading {
  // The energy-weighted mean frequency of the held part, in Hz.
  centroid: number;
  // The strongest narrow band above 2 kHz, in dB against the note's loudest moment.
  peakDb: number;
  // The same band against the held part's own energy: how alone it stands.
  shareDb: number;
}

export function whine(samples: Float32Array, sampleRate: number, heldFrom: number): WhineReading {
  const power = powerSpectrum(samples, Math.round(heldFrom * sampleRate));
  const binHz = sampleRate / WINDOW;
  const width = Math.max(1, Math.round(BAND_HZ / binHz));
  let total = 0;
  let weighted = 0;
  for (let i = 0; i < power.length; i++) {
    total += power[i];
    weighted += power[i] * i * binHz;
  }
  let band = 0;
  let strongest = 0;
  const first = Math.ceil(FROM_HZ / binHz);
  for (let i = first; i < power.length; i++) {
    band += power[i];
    if (i >= first + width) band -= power[i - width];
    strongest = Math.max(strongest, band);
  }
  // Hann loses 3/8 of the energy, and the spectrum counts each sample's energy
  // WINDOW / 2 times over in its half of the bins.
  const scale = 1 / ((3 / 8) * WINDOW * (WINDOW / 2));
  return {
    centroid: weighted / Math.max(total, 1e-30),
    peakDb: 10 * Math.log10(Math.max((strongest * scale) / loudestEnergy(samples), 1e-12)),
    shareDb: 10 * Math.log10(Math.max(strongest / Math.max(total, 1e-30), 1e-12)),
  };
}

// Sized by measuring: the library's worst is -14 dB, the old thin sounds -0.2
// (flute) to -9.7 (FM lead).
const LOUD_BAND_DB = -12;
// Weight high up is allowed only once the note has died well away.
const BRIGHT_HZ = 2000;
const BRIGHT_BAND_DB = -18;

export function isWhiny({ peakDb, centroid }: WhineReading): boolean {
  return peakDb > LOUD_BAND_DB || (centroid > BRIGHT_HZ && peakDb > BRIGHT_BAND_DB);
}
