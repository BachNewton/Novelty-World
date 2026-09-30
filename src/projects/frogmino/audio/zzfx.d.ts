// The zzfx package ships plain JavaScript with no types. Only the part the
// game uses is declared.
declare module "zzfx" {
  export const ZZFX: {
    // Scales every sample buildSamples makes.
    volume: number;
    sampleRate: number;
    // Created when the module is first imported.
    audioContext: AudioContext;
    buildSamples(...parameters: number[]): number[];
  };
}
