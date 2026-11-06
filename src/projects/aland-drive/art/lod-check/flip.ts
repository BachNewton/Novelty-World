/*
 * LDR-FLIP (Andersson et al., "FLIP: A Difference Evaluator for Alternating Images", HPG 2020; NVIDIA's reference,
 * BSD-3), ported to run beside the pictures it compares: how different two pictures look to a person at a given
 * viewing distance, per pixel, 0 to 1. Colour is compared after the eye's contrast sensitivity has filtered both, so
 * a pattern too fine to see at that distance counts for nothing; edges and points are compared on their own, so a
 * line or a corner that comes or goes counts even where the colour doesn't move. `flip.test.ts` holds it to NVIDIA's
 * own package on pictures it made.
 */

/** A picture in linear RGB, 0 to 1, row by row. */
export interface LinearPicture {
  width: number;
  height: number;
  rgb: Float32Array;
}

const QC = 0.7;
const PC = 0.4;
const PT = 0.95;
const GW = 0.082;
const QF = 0.5;

/** The contrast sensitivity of each opponent channel, as two Gaussians: weight and spread of each. */
const CSF = [
  [1, 0.0047, 0, 1e-5],
  [1, 0.0053, 0, 1e-5],
  [34.1, 0.04, 13.5, 0.025],
] as const;

const XYZ_OF_RGB = [
  [10135552 / 24577794, 8788810 / 24577794, 4435075 / 24577794],
  [2613072 / 12288897, 8788810 / 12288897, 887015 / 12288897],
  [1425312 / 73733382, 8788810 / 73733382, 70074185 / 73733382],
];
const RGB_OF_XYZ = [
  [3.241003275, -1.537398934, -0.498615861],
  [-0.969224334, 1.875930071, 0.041554224],
  [0.055639423, -0.204011202, 1.057148933],
];
const WHITE = XYZ_OF_RGB.map((row) => row[0] + row[1] + row[2]);

const times = (matrix: number[][], [a, b, c]: number[]) => matrix.map((row) => row[0] * a + row[1] * b + row[2] * c);

function ycxczOf(rgb: number[]): number[] {
  const [x, y, z] = times(XYZ_OF_RGB, rgb).map((value, k) => value / WHITE[k]);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

function rgbOf([luma, cx, cz]: number[]): number[] {
  const y = (luma + 16) / 116;
  return times(RGB_OF_XYZ, [(cx / 500 + y) * WHITE[0], y * WHITE[1], (y - cz / 200) * WHITE[2]]);
}

function huntLab(rgb: number[]): number[] {
  const f = (t: number) => (t > (6 / 29) ** 3 ? Math.cbrt(t) : t / (3 * (6 / 29) ** 2) + 4 / 29);
  const [fx, fy, fz] = times(XYZ_OF_RGB, rgb).map((value, k) => f(value / WHITE[k]));
  const lightness = 116 * fy - 16;
  return [lightness, 0.01 * lightness * 500 * (fx - fy), 0.01 * lightness * 200 * (fy - fz)];
}

const hyab = (a: number[], b: number[]) => Math.abs(a[0] - b[0]) + Math.hypot(a[1] - b[1], a[2] - b[2]);
const MOST_COLOUR = hyab(huntLab([0, 1, 0]), huntLab([0, 0, 1])) ** QC;

/** One channel convolved with a 1D kernel along rows, then another along columns, the edges held. */
function separable(source: Float32Array, width: number, height: number, across: number[], down: number[]): Float32Array {
  const [ra, rd] = [(across.length - 1) / 2, (down.length - 1) / 2];
  const middle = new Float32Array(source.length);
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      let sum = 0;
      for (let k = -ra; k <= ra; k++) sum += across[k + ra] * source[row * width + Math.min(width - 1, Math.max(0, column + k))];
      middle[row * width + column] = sum;
    }
  }
  const out = new Float32Array(source.length);
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      let sum = 0;
      for (let k = -rd; k <= rd; k++) sum += down[k + rd] * middle[Math.min(height - 1, Math.max(0, row + k)) * width + column];
      out[row * width + column] = sum;
    }
  }
  return out;
}

const range = (radius: number) => Array.from({ length: 2 * radius + 1 }, (_, index) => index - radius);

/** Each opponent channel filtered by the eye's contrast sensitivity at this many pixels a degree. */
function filtered(channels: Float32Array[], width: number, height: number, ppd: number): Float32Array[] {
  const radius = Math.ceil(3 * Math.sqrt(0.04 / (2 * Math.PI ** 2)) * ppd);
  const steps = range(radius).map((step) => step / ppd);
  return channels.map((channel, index) => {
    const [a1, b1, a2, b2] = CSF[index];
    const terms = ([[a1, b1], [a2, b2]] as const).filter(([weight]) => weight > 0).map(([weight, spread]) => ({ scale: weight * Math.sqrt(Math.PI / spread), line: steps.map((x) => Math.exp((-(Math.PI ** 2) * x * x) / spread)) }));
    const total = terms.reduce((sum, { scale, line }) => sum + scale * line.reduce((a, b) => a + b, 0) ** 2, 0);
    const out = new Float32Array(channel.length);
    for (const { scale, line } of terms) {
      const pass = separable(channel, width, height, line, line);
      for (let at = 0; at < out.length; at++) out[at] += (scale * pass[at]) / total;
    }
    return out;
  });
}

/**
 * How strong an edge and a point each pixel holds, from its luminance. The reference's kernels are a Gaussian's first
 * and second derivatives across, times the Gaussian down, with negative and positive weights each scaled to sum to
 * one; which sign a weight has depends on its column alone, so each kernel splits into one along a row and one down.
 */
function features(luminance: Float32Array, width: number, height: number, ppd: number): { edges: Float32Array; points: Float32Array } {
  const spread = 0.5 * GW * ppd;
  const steps = range(Math.ceil(3 * spread));
  const gauss = steps.map((x) => Math.exp(-(x * x) / (2 * spread * spread)));
  const balanced = (line: number[]) => {
    const [negative, positive] = [-line.filter((w) => w < 0).reduce((a, b) => a + b, 0), line.filter((w) => w > 0).reduce((a, b) => a + b, 0)];
    return line.map((w) => (w < 0 ? w / negative : w / positive));
  };
  const down = gauss.map((g) => g / gauss.reduce((a, b) => a + b, 0));
  const strength = (line: number[]) => {
    const [across, along] = [separable(luminance, width, height, line, down), separable(luminance, width, height, down, line)];
    return across.map((value, at) => Math.hypot(value, along[at]));
  };
  return {
    edges: strength(balanced(steps.map((x, k) => -x * gauss[k]))),
    points: strength(balanced(steps.map((x, k) => ((x * x) / (spread * spread) - 1) * gauss[k]))),
  };
}

/** The FLIP error of `test` against `reference`, per pixel, viewed at `ppd` pixels a degree. */
export function flip(reference: LinearPicture, test: LinearPicture, ppd: number): Float32Array {
  const { width, height } = reference;
  if (test.width !== width || test.height !== height) throw new Error("FLIP compares pictures of one size");
  const opponent = ({ rgb }: LinearPicture) => {
    const channels = [0, 1, 2].map(() => new Float32Array(width * height));
    for (let at = 0; at < width * height; at++) ycxczOf([rgb[at * 3], rgb[at * 3 + 1], rgb[at * 3 + 2]]).forEach((value, k) => (channels[k][at] = value));
    return channels;
  };
  const [ours, theirs] = [opponent(reference), opponent(test)];
  const [seenOurs, seenTheirs] = [filtered(ours, width, height, ppd), filtered(theirs, width, height, ppd)];
  const relative = (channels: Float32Array[]) => channels[0].map((luma) => (luma + 16) / 116);
  const [featuresOurs, featuresTheirs] = [features(relative(ours), width, height, ppd), features(relative(theirs), width, height, ppd)];
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  const out = new Float32Array(width * height);
  for (let at = 0; at < width * height; at++) {
    const lab = (seen: Float32Array[]) => huntLab(rgbOf([seen[0][at], seen[1][at], seen[2][at]]).map(clamp));
    const colour = hyab(lab(seenOurs), lab(seenTheirs)) ** QC;
    const spread = colour < PC * MOST_COLOUR ? (PT / (PC * MOST_COLOUR)) * colour : PT + ((colour - PC * MOST_COLOUR) / (MOST_COLOUR - PC * MOST_COLOUR)) * (1 - PT);
    const feature = (Math.max(Math.abs(featuresOurs.edges[at] - featuresTheirs.edges[at]), Math.abs(featuresOurs.points[at] - featuresTheirs.points[at])) / Math.SQRT2) ** QF;
    out[at] = spread ** (1 - feature);
  }
  return out;
}
