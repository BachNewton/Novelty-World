import process from "node:process";

/** Where an exported file's floats came from. Since Node 24, V8's `Math.pow` (and `**`) call the
 *  platform's C runtime, whose last bit differs from Node 22's own `pow` and between platforms, so
 *  the blitz odds, and every table, golden and game record built on them, belong to the Node and
 *  platform that computed them; a file says which, so no two generations are ever mixed. */
export interface Provenance {
  node: string;
  v8: string;
  platform: string;
  arch: string;
  exportedAt: string;
}

export function provenance(): Provenance {
  return {
    node: process.version,
    v8: process.versions.v8,
    platform: process.platform,
    arch: process.arch,
    exportedAt: new Date().toISOString(),
  };
}
