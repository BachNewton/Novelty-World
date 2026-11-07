/** Bits of a class: red, green, blue. These match `pipeline/path_surfaces.py`. Steps are a way's only. */
export const CLASS = { none: 0b000, steps: 0b001, bed: 0b011, lawn: 0b010, gravel: 0b100, slab: 0b110, tarmac: 0b101, cobble: 0b111 } as const;
export type SurfaceClass = (typeof CLASS)[keyof typeof CLASS];
