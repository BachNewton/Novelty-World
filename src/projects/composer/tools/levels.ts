// Each band's `level`, worked out from its piece's loudest moment: run it after
// changing a piece or its band, and copy the numbers into the band's file.
//   npx tsx src/projects/composer/tools/levels.ts [piece id]

import { PIECES } from "../pieces";
import { BandStream } from "../synth/band";
import { bandsOf } from "../types";

const SAMPLE_RATE = 44100;
const only: string | undefined = process.argv.at(2);

for (const piece of PIECES) {
  if (only !== undefined && only !== piece.id) continue;
  for (const band of bandsOf(piece)) {
    const stream = new BandStream(piece.score(), band, SAMPLE_RATE);
    while (stream.next() !== null);
    console.log(`${piece.id}${band.name === undefined ? "" : ` (${band.name})`}: level ${(1 / stream.peak).toFixed(3)}`);
  }
}
