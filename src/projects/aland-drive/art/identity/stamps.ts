import "./tokens.css";

/*
 * The collectible stamps: invented designs, drawn on any 2D canvas from code, in a
 * printer's limited inks, with perforated edges and ÅLAND in letters of our own. They
 * are original drawings: no stamp of Åland Post's was a source, only the things
 * themselves. No React and no DOM beyond the page's CSS tokens, so anything with a
 * canvas can call these. `stampDesigns` lists them, and `drawStamp` draws one.
 */

export const INKS = ["paper", "ink", "sea", "deep", "sky", "dusk", "sun", "red", "rust", "pink", "green", "moss", "pine", "stone", "wood"] as const;
export type Ink = (typeof INKS)[number];
export type InkSet = Record<Ink, string>;
export type Canvas2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** The printer's inks, read from the tokens. */
export function readInks(): InkSet {
  const style = getComputedStyle(document.documentElement);
  return Object.fromEntries(INKS.map((ink) => [ink, style.getPropertyValue(`--color-aland-drive-stamp-${ink}`).trim()])) as InkSet;
}

export const STAMP_WIDTH = 340;
export const STAMP_HEIGHT = 440;
const MARGIN = 20;
const PICTURE_WIDTH = STAMP_WIDTH - MARGIN * 2;
const PICTURE_HEIGHT = 340;
const TOOTH = 7.2;
const TEETH_WIDE = 13;
const TEETH_TALL = 17;

type Point = readonly [number, number];

/** A pen over a picture 300 wide and 340 tall, y down. */
export class Pen {
  constructor(readonly ctx: Canvas2D, readonly inks: InkSet) {}

  field(ink: Ink): this {
    return this.rect(ink, 0, 0, PICTURE_WIDTH, PICTURE_HEIGHT);
  }

  rect(ink: Ink, x: number, y: number, wide: number, tall: number): this {
    this.ctx.fillStyle = this.inks[ink];
    this.ctx.fillRect(x, y, wide, tall);
    return this;
  }

  poly(ink: Ink, ...points: Point[]): this {
    this.ctx.fillStyle = this.inks[ink];
    this.ctx.beginPath();
    points.forEach(([x, y], index) => (index === 0 ? this.ctx.moveTo(x, y) : this.ctx.lineTo(x, y)));
    this.ctx.closePath();
    this.ctx.fill();
    return this;
  }

  disc(ink: Ink, x: number, y: number, radius: number, squash = 1): this {
    this.ctx.fillStyle = this.inks[ink];
    this.ctx.beginPath();
    this.ctx.ellipse(x, y, radius, radius * squash, 0, 0, 2 * Math.PI);
    this.ctx.fill();
    return this;
  }

  line(ink: Ink, width: number, ...points: Point[]): this {
    this.ctx.strokeStyle = this.inks[ink];
    this.ctx.lineWidth = width;
    this.ctx.lineCap = "round";
    this.ctx.lineJoin = "round";
    this.ctx.beginPath();
    points.forEach(([x, y], index) => (index === 0 ? this.ctx.moveTo(x, y) : this.ctx.lineTo(x, y)));
    this.ctx.stroke();
    return this;
  }

  /** Rolling ground from a left height to a right height, filled to the picture's foot. */
  hill(ink: Ink, left: number, peakX: number, peakY: number, right: number): this {
    this.ctx.fillStyle = this.inks[ink];
    this.ctx.beginPath();
    this.ctx.moveTo(0, PICTURE_HEIGHT);
    this.ctx.lineTo(0, left);
    this.ctx.quadraticCurveTo(peakX, peakY * 2 - (left + right) / 2, PICTURE_WIDTH, right);
    this.ctx.lineTo(PICTURE_WIDTH, PICTURE_HEIGHT);
    this.ctx.closePath();
    this.ctx.fill();
    return this;
  }

  /** The sea from a line to the foot, and short strokes of swell. */
  sea(y: number, water: Ink = "sea", swell: Ink = "sky"): this {
    this.rect(water, 0, y, PICTURE_WIDTH, PICTURE_HEIGHT - y);
    const rows = Math.floor((PICTURE_HEIGHT - y) / 16);
    for (let row = 1; row <= rows; row++) {
      for (let dash = 0; dash < 5; dash++) {
        const x = ((dash * 67 + row * 41) % 320) - 10;
        const wide = 14 + ((dash * 13 + row * 7) % 22);
        this.line(swell, 2, [x, y + row * 16 - 4], [x + wide, y + row * 16 - 4]);
      }
    }
    return this;
  }

  pine(x: number, foot: number, tall: number, ink: Ink = "pine"): this {
    this.rect("wood", x - tall * 0.03, foot - tall * 0.3, tall * 0.06, tall * 0.3);
    return this.poly(ink, [x, foot - tall], [x + tall * 0.18, foot - tall * 0.55], [x + tall * 0.1, foot - tall * 0.55], [x + tall * 0.27, foot - tall * 0.18], [x - tall * 0.27, foot - tall * 0.18], [x - tall * 0.1, foot - tall * 0.55], [x - tall * 0.18, foot - tall * 0.55]);
  }

  gull(x: number, y: number, span: number, ink: Ink = "ink"): this {
    this.ctx.strokeStyle = this.inks[ink];
    this.ctx.lineWidth = 2.5;
    this.ctx.lineCap = "round";
    this.ctx.beginPath();
    this.ctx.moveTo(x - span, y);
    this.ctx.quadraticCurveTo(x - span / 2, y - span * 0.5, x, y);
    this.ctx.quadraticCurveTo(x + span / 2, y - span * 0.5, x + span, y);
    this.ctx.stroke();
    return this;
  }

  rays(ink: Ink, x: number, y: number, from: number, to: number, count: number, width = 4): this {
    for (let ray = 0; ray < count; ray++) {
      const angle = (ray / count) * 2 * Math.PI;
      this.line(ink, width, [x + Math.cos(angle) * from, y + Math.sin(angle) * from], [x + Math.cos(angle) * to, y + Math.sin(angle) * to]);
    }
    return this;
  }

  /** A low-gabled house, front on, with its gable to the right: reused by hut, cottage and sauna. */
  barn(x: number, foot: number, wide: number, tall: number, wall: Ink, roof: Ink, gable: Ink = wall): this {
    const end = wide * 0.42;
    const rise = tall * 0.62;
    return this.rect(wall, x, foot - tall, wide - end, tall)
      .poly(gable, [x + wide - end, foot], [x + wide, foot], [x + wide, foot - tall], [x + wide - end / 2, foot - tall - rise], [x + wide - end, foot - tall])
      .poly(roof, [x - 6, foot - tall + 2], [x + wide - end, foot - tall + 2], [x + wide - end / 2, foot - tall - rise], [x + end * 0.35, foot - tall - rise]);
  }
}

export interface StampDesign {
  id: string;
  /** The name it goes by in the album. */
  name: string;
  /** What finds it: a discovery kind, or a real place. */
  finds: string;
  draw: (pen: Pen) => void;
}

const appleShape = (pen: Pen, x: number, y: number, size: number, skin: Ink, shine: Ink) => {
  pen.disc(skin, x - size * 0.34, y, size * 0.62, 1.12).disc(skin, x + size * 0.34, y, size * 0.62, 1.12);
  pen.poly(skin, [x - size * 0.5, y + size * 0.55], [x + size * 0.5, y + size * 0.55], [x + size * 0.14, y + size * 0.74], [x, y + size * 0.66], [x - size * 0.14, y + size * 0.74]);
  pen.disc(shine, x - size * 0.5, y - size * 0.22, size * 0.15, 1.5);
  pen.line("wood", size * 0.08, [x, y - size * 0.5], [x + size * 0.1, y - size * 0.92]);
  pen.poly("moss", [x + size * 0.08, y - size * 0.62], [x + size * 0.42, y - size * 0.98], [x + size * 0.76, y - size * 0.92], [x + size * 0.46, y - size * 0.58]);
};

const postMill = (pen: Pen, x: number, foot: number, size: number) => {
  pen.poly("wood", [x - size * 0.34, foot], [x + size * 0.34, foot], [x + size * 0.06, foot - size * 0.42], [x - size * 0.06, foot - size * 0.42]);
  pen.rect("red", x - size * 0.22, foot - size * 0.92, size * 0.44, size * 0.54);
  pen.poly("ink", [x - size * 0.26, foot - size * 0.92], [x + size * 0.26, foot - size * 0.92], [x, foot - size * 1.14]);
  const hub: Point = [x, foot - size * 0.74];
  for (let sail = 0; sail < 4; sail++) {
    const angle = 0.5 + (sail * Math.PI) / 2;
    const [dx, dy] = [Math.cos(angle), Math.sin(angle)];
    const reach = size * 0.82;
    pen.line("ink", size * 0.022, hub, [hub[0] + dx * reach, hub[1] + dy * reach]);
    const [px, py] = [-dy * size * 0.13, dx * size * 0.13];
    pen.poly("paper", [hub[0] + dx * size * 0.14, hub[1] + dy * size * 0.14], [hub[0] + dx * reach, hub[1] + dy * reach], [hub[0] + dx * reach + px, hub[1] + dy * reach + py], [hub[0] + dx * size * 0.14 + px, hub[1] + dy * size * 0.14 + py]);
    for (const share of [0.4, 0.6, 0.8]) pen.line("ink", size * 0.012, [hub[0] + dx * reach * share, hub[1] + dy * reach * share], [hub[0] + dx * reach * share + px, hub[1] + dy * reach * share + py]);
  }
  pen.disc("ink", hub[0], hub[1], size * 0.04);
};

const lighthouse = (pen: Pen, x: number, foot: number, size: number) => {
  const wide = (share: number) => size * (0.17 - 0.07 * share);
  const at = (share: number) => foot - size * 0.92 * share;
  const band = (from: number, to: number, ink: Ink) => pen.poly(ink, [x - wide(from), at(from)], [x + wide(from), at(from)], [x + wide(to), at(to)], [x - wide(to), at(to)]);
  band(0, 0.34, "paper");
  band(0.34, 0.66, "red");
  band(0.66, 1, "paper");
  pen.rect("ink", x - size * 0.13, at(1) - size * 0.012, size * 0.26, size * 0.018);
  pen.rect("dusk", x - size * 0.07, at(1) - size * 0.1, size * 0.14, size * 0.09);
  pen.poly("red", [x - size * 0.09, at(1) - size * 0.1], [x + size * 0.09, at(1) - size * 0.1], [x, at(1) - size * 0.17]);
};

export const STAMPS: readonly StampDesign[] = [
  {
    id: "parish-church",
    name: "Sockenkyrkan",
    finds: "a medieval parish church",
    draw: (pen) => {
      pen.field("dusk").disc("sun", 222, 88, 40).hill("moss", 240, 150, 212, 248);
      pen.rect("stone", 122, 170, 136, 74).rect("pink", 122, 214, 136, 30);
      pen.poly("ink", [116, 172], [262, 172], [246, 132], [132, 132]);
      for (const x of [150, 190, 230]) pen.disc("ink", x, 196, 7).rect("ink", x - 7, 196, 14, 18);
      pen.rect("paper", 64, 118, 62, 126).rect("pink", 64, 214, 62, 30);
      pen.poly("ink", [58, 120], [132, 120], [95, 18]);
      pen.rect("ink", 88, 150, 14, 22).disc("ink", 95, 150, 7);
      pen.line("ink", 3, [95, 18], [95, 4]).line("ink", 3, [89, 10], [101, 10]);
      pen.hill("green", 268, 160, 256, 276);
      for (const x of [16, 42, 268, 288]) pen.disc("pine", x, 232, 20, 1.2);
      for (let stone = 0; stone < 12; stone++) pen.disc("stone", 14 + stone * 25, 280, 12, 0.6);
    },
  },
  {
    id: "windmill",
    name: "Väderkvarnen",
    finds: "a post mill",
    draw: (pen) => {
      pen.field("sky").disc("paper", 62, 66, 26, 0.5).disc("paper", 92, 62, 32, 0.5).hill("moss", 276, 150, 214, 262);
      postMill(pen, 150, 256, 190);
      pen.hill("green", 300, 90, 280, 306);
    },
  },
  {
    id: "pommern",
    name: "Pommern",
    finds: "the four-masted barque in Mariehamn",
    draw: (pen) => {
      pen.field("sky").disc("sun", 240, 60, 26).sea(256);
      pen.poly("paper", [14, 232], [288, 228], [270, 266], [34, 266]).poly("red", [26, 256], [276, 253], [270, 266], [34, 266]).line("ink", 1.5, [14, 232], [288, 228]);
      for (let port = 0; port < 12; port++) pen.rect("ink", 34 + port * 20, 234, 10, 4);
      pen.line("ink", 3, [288, 230], [298, 212]);
      const masts = [64, 122, 180, 236];
      masts.forEach((x, mast) => {
        pen.line("ink", 3, [x, 232], [x, 36]);
        if (mast === 3) {
          pen.poly("paper", [x - 40, 128], [x - 2, 86], [x - 2, 208], [x - 48, 208]);
          return;
        }
        [[212, 52], [172, 46], [136, 40], [104, 33], [76, 26]].forEach(([y, half], tier) => {
          const tall = [34, 32, 30, 26, 22][tier];
          pen.poly(tier === 0 ? "dusk" : "paper", [x - half + 3, y - tall], [x + half - 3, y - tall], [x + half, y], [x - half, y]);
          pen.line("ink", 1.5, [x - half, y], [x + half, y]);
        });
      });
      pen.line("ink", 1.5, [64, 40], [122, 40]).line("ink", 1.5, [122, 40], [180, 40]).line("ink", 1.5, [180, 40], [236, 40]);
    },
  },
  {
    id: "kastelholm",
    name: "Kastelholm",
    finds: "the castle at Sund",
    draw: (pen) => {
      pen.field("dusk").hill("pine", 188, 60, 150, 170);
      pen.rect("stone", 30, 160, 240, 80);
      pen.rect("stone", 70, 70, 76, 170).poly("red", [64, 72], [152, 72], [108, 22]);
      pen.rect("paper", 150, 120, 100, 120).poly("red", [144, 122], [256, 122], [236, 86], [164, 86]);
      for (const x of [86, 116]) pen.rect("ink", x, 96, 10, 18);
      for (const [x, y] of [[170, 150], [200, 150], [230, 150], [170, 190], [200, 190], [230, 190]] as const) pen.rect("ink", x, y, 10, 16);
      pen.disc("ink", 50, 216, 12).rect("ink", 38, 216, 24, 24);
      pen.poly("pink", [0, 262], [60, 234], [260, 236], [300, 256], [300, 280], [0, 280]);
      for (const [x, y] of [[30, 262], [98, 250], [170, 252], [244, 262], [130, 270]] as const) pen.disc("stone", x, y, 12, 0.5);
      pen.sea(274);
    },
  },
  {
    id: "bomarsund",
    name: "Bomarsund",
    finds: "the Russian fortress ruins",
    draw: (pen) => {
      pen.field("sky").sea(118, "sea", "paper").hill("moss", 212, 150, 176, 196);
      pen.poly("pink", [0, 156], [226, 192], [226, 278], [0, 278]).poly("rust", [226, 192], [262, 200], [282, 240], [256, 278], [226, 278]);
      for (let bay = 0; bay < 5; bay++) {
        const x = 18 + bay * 42;
        const y = 196 + bay * 7;
        pen.disc("ink", x, y, 14).rect("ink", x - 14, y, 28, 40).line("paper", 3, [x - 16, y + 41], [x + 16, y + 41]);
      }
      for (let stone = 0; stone < 10; stone++) pen.line("paper", 2.5, [8 + stone * 22, 164 + stone * 3.5], [24 + stone * 22, 167 + stone * 3.5]);
      pen.poly("ink", [150, 183], [168, 170], [190, 187], [212, 178], [226, 192]);
      pen.hill("green", 286, 150, 270, 300);
      for (const [x, y, r] of [[250, 288, 13], [278, 298, 11], [226, 304, 9]] as const) pen.disc("stone", x, y, r, 0.6);
    },
  },
  {
    id: "red-boathouse",
    name: "Sjöboden",
    finds: "a red boathouse",
    draw: (pen) => {
      pen.field("sky").disc("paper", 234, 60, 24, 0.5).hill("pine", 150, 70, 110, 136).sea(204, "sea", "paper");
      pen.barn(44, 196, 210, 74, "red", "ink", "red");
      pen.rect("paper", 190, 136, 42, 60).rect("ink", 196, 142, 30, 54);
      pen.rect("paper", 72, 142, 34, 26).rect("ink", 76, 146, 26, 18);
      for (const x of [54, 104, 154, 204, 244]) pen.rect("ink", x, 196, 8, 44);
      pen.poly("stone", [0, 198], [40, 198], [50, 216], [0, 226]);
      pen.poly("paper", [120, 262], [216, 262], [200, 278], [134, 278]).line("ink", 2, [168, 262], [168, 276]);
    },
  },
  {
    id: "rapakivi",
    name: "Rapakivi",
    finds: "a red granite outcrop",
    draw: (pen) => {
      pen.field("red");
      const ovoids: readonly [number, number, number][] = [[62, 58, 44], [176, 44, 36], [262, 88, 44], [108, 150, 54], [226, 186, 48], [40, 240, 42], [146, 272, 48], [262, 290, 38], [10, 140, 26], [176, 118, 18], [80, 324, 26], [214, 322, 18]];
      for (const [x, y, radius] of ovoids) {
        pen.disc("paper", x, y, radius, 0.88).disc("pink", x, y, radius * 0.8, 0.88);
      }
      for (let crystal = 0; crystal < 26; crystal++) {
        const [x, y] = [(crystal * 97) % 300, (crystal * 61) % 340];
        pen.poly("ink", [x, y], [x + 7, y + 2], [x + 4, y + 7]);
      }
    },
  },
  {
    id: "midsummer-pole",
    name: "Midsommarstången",
    finds: "a village midsummer pole",
    draw: (pen) => {
      pen.field("dusk").hill("moss", 306, 150, 296, 306);
      const [x, top] = [150, 28];
      pen.line("paper", 7, [x, 310], [x, top]);
      pen.line("ink", 2, [x, top], [x - 14, top + 6]).line("ink", 2, [x, top], [x + 14, top - 6]);
      pen.disc("ink", x, top - 5, 4);
      // The hourglasses of leaf between pole and ropes.
      pen.poly("green", [x, 92], [x + 62, 62], [x, 170], [x - 62, 62]).poly("green", [x, 92], [x + 62, 216], [x - 62, 216]);
      pen.poly("moss", [x, 106], [x + 40, 74], [x, 150], [x - 40, 74]);
      pen.line("ink", 5, [x - 70, 62], [x + 70, 62]).line("ink", 4, [x - 62, 216], [x + 62, 216]);
      for (const side of [-1, 1]) {
        pen.disc("moss", x + side * 74, 88, 15).disc("dusk", x + side * 74, 88, 8);
        pen.line("red", 3, [x + side * 72, 104], [x + side * 76, 128]).line("sun", 3, [x + side * 66, 104], [x + side * 68, 126]);
      }
      // A small boat sailing the pole, and Åland's three colours on its streamer.
      pen.poly("paper", [x - 26, 256], [x + 26, 256], [x + 16, 268], [x - 16, 268]).line("ink", 2, [x, 256], [x, 234]).poly("red", [x + 2, 236], [x + 18, 252], [x + 2, 252]);
      pen.poly("deep", [x + 4, 34], [x + 58, 28], [x + 48, 38], [x + 58, 48], [x + 4, 46]).line("sun", 3, [x + 4, 40], [x + 48, 38]).line("red", 1.5, [x + 4, 40], [x + 48, 38]);
    },
  },
  {
    id: "ferry",
    name: "Färjan",
    finds: "a Baltic car ferry",
    draw: (pen) => {
      pen.field("dusk").disc("paper", 72, 72, 30).sea(236);
      pen.poly("deep", [14, 186], [292, 186], [266, 244], [24, 244]);
      pen.poly("paper", [26, 110], [244, 110], [276, 186], [14, 186]);
      pen.poly("paper", [60, 76], [196, 76], [214, 110], [50, 110]);
      for (let row = 0; row < 3; row++) {
        for (let window = 0; window < 15 - row * 2; window++) pen.rect("ink", 34 + row * 20 + window * 15.5, 166 - row * 28, 9, 7);
      }
      pen.rect("red", 96, 44, 34, 34).rect("paper", 96, 56, 34, 8);
      pen.poly("ink", [196, 88], [234, 88], [246, 110], [200, 110]);
      pen.line("ink", 2, [156, 76], [156, 46]);
      pen.gull(238, 58, 12).gull(262, 74, 9);
    },
  },
  {
    id: "apple",
    name: "Äpplet",
    finds: "an orchard",
    draw: (pen) => {
      pen.field("moss").rays("sun", 150, 176, 104, 150, 22, 6);
      appleShape(pen, 150, 170, 130, "red", "rust");
      pen.disc("paper", 94, 134, 6, 1.8);
    },
  },
  {
    id: "pancake",
    name: "Ålandspannkakan",
    finds: "a farm stall's pancake",
    draw: (pen) => {
      pen.field("deep");
      for (let row = 0; row < 7; row++) {
        for (let dot = 0; dot < 6; dot++) pen.disc("sea", 26 + dot * 50 + (row % 2) * 25, 26 + row * 50, 5);
      }
      pen.disc("paper", 150, 182, 132, 0.8).disc("sky", 150, 182, 106, 0.8);
      // A square-cut slice, its crust toward us, with prune on the top and whipped cream, the snömos.
      pen.poly("rust", [70, 208], [196, 244], [196, 266], [70, 230]).poly("wood", [196, 244], [238, 188], [238, 210], [196, 266]);
      pen.poly("sun", [70, 208], [120, 150], [238, 188], [196, 244]);
      pen.poly("dusk", [92, 204], [128, 164], [214, 192], [184, 230]);
      pen.disc("ink", 158, 182, 32, 0.56).disc("red", 150, 176, 20, 0.5);
      pen.disc("paper", 176, 152, 30, 0.7).disc("paper", 166, 128, 20, 0.8).disc("paper", 178, 110, 10);
      pen.line("sky", 3, [152, 150], [196, 142]).line("sky", 3, [158, 126], [180, 122]);
    },
  },
  {
    id: "lighthouse",
    name: "Fyren",
    finds: "a lighthouse",
    draw: (pen) => {
      pen.field("deep");
      pen.poly("dusk", [150, 76], [0, 16], [0, 72]).poly("dusk", [150, 76], [300, 112], [300, 170]);
      pen.sea(270, "sea", "sky");
      pen.poly("pink", [36, 278], [94, 232], [212, 228], [274, 280]).poly("rust", [94, 232], [150, 232], [130, 280], [36, 280]);
      lighthouse(pen, 150, 236, 220);
      pen.disc("paper", 58, 180, 2).disc("paper", 34, 122, 2).disc("paper", 246, 40, 2).disc("paper", 212, 26, 2).disc("paper", 94, 26, 2);
    },
  },
  {
    id: "sauna",
    name: "Bastun",
    finds: "a shore sauna",
    draw: (pen) => {
      pen.field("sky").disc("sun", 58, 70, 28).hill("pine", 154, 150, 118, 158);
      pen.pine(40, 170, 110).pine(262, 172, 120).sea(190, "sea", "paper");
      pen.barn(70, 192, 128, 58, "wood", "ink", "wood");
      pen.rect("paper", 88, 152, 26, 40).rect("ink", 94, 158, 14, 34);
      pen.rect("ink", 170, 92, 7, 54);
      pen.disc("paper", 178, 78, 9).disc("paper", 190, 56, 13).disc("paper", 206, 28, 17);
      pen.rect("paper", 70, 192, 22, 6).rect("wood", 42, 194, 130, 6);
      for (const x of [48, 88, 128, 166]) pen.rect("ink", x, 198, 5, 26);
      pen.line("paper", 2.5, [116, 256], [150, 256]).line("paper", 2.5, [60, 240], [104, 240]);
    },
  },
  {
    id: "kummel",
    name: "Kummeln",
    finds: "a sea mark",
    draw: (pen) => {
      pen.field("sky").sea(214, "sea", "paper");
      pen.poly("pink", [0, 300], [40, 226], [136, 196], [240, 214], [300, 286], [300, 340], [0, 340]);
      pen.poly("rust", [0, 300], [40, 226], [120, 242], [80, 340], [0, 340]);
      pen.line("ink", 2, [40, 300], [86, 262]).line("ink", 2, [176, 260], [232, 288]);
      const stones: readonly [number, number, number][] = [[112, 196, 22], [152, 192, 24], [190, 198, 20], [130, 164, 20], [170, 162, 20], [150, 134, 18], [142, 106, 14], [160, 108, 12], [150, 84, 11]];
      for (const [x, y, radius] of stones) pen.disc("stone", x + 2, y + 3, radius, 0.74).disc("paper", x, y, radius, 0.74);
      pen.gull(60, 74, 15).gull(232, 112, 12).gull(248, 62, 9);
    },
  },
  {
    id: "harvest",
    name: "Skörden",
    finds: "an open farm",
    draw: (pen) => {
      pen.field("sun").hill("rust", 240, 150, 212, 228);
      for (let row = 0; row < 7; row++) pen.line("dusk", 3, [150, 228], [row * 50, 300]);
      pen.rect("paper", 56, 16, 5, 244);
      pen.poly("red", [61, 20], [240, 20], [240, 36], [61, 36]).poly("paper", [61, 36], [240, 36], [220, 150], [61, 168]);
      appleShape(pen, 142, 98, 54, "red", "rust");
      // A crate of apples in the foreground.
      pen.rect("wood", 110, 256, 170, 62);
      for (const y of [272, 290, 306]) pen.line("ink", 2, [110, y], [280, y]);
      for (let fruit = 0; fruit < 7; fruit++) pen.disc(fruit % 3 === 2 ? "moss" : "red", 124 + fruit * 24, 248 + (fruit % 2) * 6, 15);
    },
  },
  {
    id: "cable-ferry",
    name: "Linfärjan",
    finds: "a cable ferry crossing",
    draw: (pen) => {
      pen.field("sky").hill("pine", 124, 40, 96, 150).hill("moss", 200, 220, 160, 150).sea(166, "sea", "paper");
      pen.line("ink", 2.5, [0, 202], [300, 210]);
      pen.poly("sun", [12, 184], [52, 204], [52, 212], [12, 192]).poly("sun", [288, 184], [248, 204], [248, 212], [288, 192]);
      pen.poly("deep", [50, 204], [250, 204], [244, 238], [56, 238]);
      pen.rect("paper", 50, 202, 200, 6);
      pen.rect("red", 86, 176, 62, 24).poly("red", [96, 178], [108, 160], [132, 160], [142, 178]).rect("sky", 110, 164, 20, 12);
      pen.disc("ink", 102, 200, 9).disc("ink", 134, 200, 9);
      for (const x of [172, 216]) pen.rect("paper", x, 170, 4, 34);
      pen.rect("paper", 168, 136, 54, 34).rect("sky", 176, 142, 40, 14).line("ink", 2, [168, 134], [224, 134]);
    },
  },
  {
    id: "viewing-tower",
    name: "Utsiktstornet",
    finds: "a viewing tower",
    draw: (pen) => {
      pen.field("dusk").disc("sun", 72, 72, 34).sea(190, "sea", "paper");
      pen.hill("pine", 240, 150, 198, 252);
      pen.pine(38, 276, 96).pine(258, 280, 110).pine(216, 268, 74);
      const [x, foot, top] = [150, 272, 74];
      for (const side of [-1, 1]) pen.line("paper", 6, [x + side * 52, foot], [x + side * 26, top]);
      for (const y of [120, 170, 220]) {
        const half = 26 + ((y - top) / (foot - top)) * 26;
        pen.line("paper", 4, [x - half, y], [x + half, y]);
        pen.line("paper", 3, [x - half, y], [x + half + 6, y + 50]);
      }
      pen.rect("wood", x - 42, top - 4, 84, 10).line("paper", 4, [x - 40, top - 26], [x + 40, top - 26]);
      for (const offset of [-38, 0, 38]) pen.line("paper", 3, [x + offset, top - 26], [x + offset, top]);
      pen.poly("ink", [x - 52, top - 42], [x + 52, top - 42], [x, top - 66]);
      for (const side of [-1, 1]) pen.line("ink", 3, [x + side * 36, top - 42], [x + side * 36, top - 26]);
      pen.hill("green", 292, 150, 276, 300);
    },
  },
  {
    id: "cyclist",
    name: "Cyklisten",
    finds: "a cycle route",
    draw: (pen) => {
      pen.field("sky").disc("paper", 226, 62, 30, 0.45).disc("paper", 250, 58, 26, 0.45).hill("moss", 174, 90, 150, 206);
      pen.rect("red", 212, 172, 54, 30).poly("ink", [204, 174], [274, 174], [264, 156], [214, 156]);
      pen.pine(32, 212, 80).pine(62, 214, 60);
      pen.hill("green", 218, 150, 232, 214).poly("stone", [0, 272], [300, 244], [300, 276], [0, 306]);
      const foot = 268;
      const [back, front, radius] = [86, 196, 34];
      for (const x of [back, front]) {
        pen.ctx.strokeStyle = pen.inks.ink;
        pen.ctx.lineWidth = 5;
        pen.ctx.beginPath();
        pen.ctx.arc(x, foot - radius, radius, 0, 2 * Math.PI);
        pen.ctx.stroke();
      }
      const crank: Point = [132, foot - radius];
      const seat: Point = [112, 174];
      const bars: Point = [186, 176];
      pen.line("red", 5, crank, seat, bars, crank, [back, foot - radius], seat).line("red", 5, bars, [front, foot - radius]);
      // Rider.
      pen.line("deep", 12, seat, [146, 208], [138, 236]).line("sun", 18, seat, [158, 128]);
      pen.line("pink", 7, [158, 130], [184, 172]);
      pen.disc("pink", 168, 104, 13).poly("paper", [150, 102], [186, 96], [176, 86], [158, 86]);
    },
  },
  {
    id: "fishing-nets",
    name: "Näten",
    finds: "a fishing harbour",
    draw: (pen) => {
      pen.field("sky").sea(196, "sea", "paper").gull(70, 50, 15).gull(112, 78, 11).gull(226, 58, 13);
      pen.poly("stone", [0, 232], [300, 226], [300, 340], [0, 340]);
      for (const x of [30, 270]) pen.line("wood", 8, [x - 14, 280], [x, 104]).line("wood", 8, [x + 14, 280], [x, 104]);
      pen.line("wood", 8, [14, 112], [286, 112]);
      for (const [from, to, foot] of [[34, 112, 250], [120, 192, 232], [200, 266, 258]] as const) {
        pen.ctx.save();
        pen.ctx.beginPath();
        pen.ctx.rect(from, 112, to - from, foot - 112);
        pen.ctx.clip();
        pen.rect("deep", from, 112, to - from, foot - 112);
        for (let line = -24; line < 28; line++) {
          pen.line("sky", 1.5, [from + line * 12, 112], [from + line * 12 + 180, 292]);
          pen.line("sky", 1.5, [from + line * 12, 112], [from + line * 12 - 180, 292]);
        }
        pen.ctx.restore();
        for (let float = 0; float < 3; float++) pen.disc("rust", from + 12 + float * ((to - from - 24) / 2), 122, 8, 0.75);
      }
      pen.disc("rust", 74, 300, 14, 0.8).disc("paper", 106, 306, 11, 0.8).disc("rust", 192, 302, 12, 0.8);
    },
  },
  {
    id: "sea-eagle",
    name: "Havsörnen",
    finds: "a white-tailed eagle",
    draw: (pen) => {
      pen.field("sky").disc("dusk", 190, 150, 94);
      pen.pine(32, 330, 110).pine(74, 340, 80).pine(270, 334, 96);
      pen.hill("pine", 320, 160, 300, 326);
      const wing = (side: number) => pen.poly("ink", [150, 134], [150 + side * 40, 104], [150 + side * 92, 96], [150 + side * 138, 114], [150 + side * 124, 124], [150 + side * 134, 136], [150 + side * 112, 136], [150 + side * 116, 148], [150 + side * 92, 146], [150 + side * 90, 158], [150 + side * 50, 152], [150 + side * 18, 166]);
      wing(-1);
      wing(1);
      pen.poly("ink", [138, 110], [162, 110], [168, 180], [132, 180]);
      pen.poly("paper", [132, 178], [168, 178], [178, 218], [150, 226], [122, 218]);
      pen.disc("stone", 150, 96, 17).poly("sun", [142, 88], [158, 88], [150, 66]);
    },
  },
  {
    id: "summer-cottage",
    name: "Stugan",
    finds: "a summer cottage",
    draw: (pen) => {
      pen.field("sky").hill("pine", 118, 150, 84, 128).sea(144, "sea", "paper");
      pen.hill("moss", 202, 150, 178, 198);
      pen.barn(44, 216, 180, 70, "red", "ink", "red");
      pen.rect("paper", 72, 166, 30, 28).rect("ink", 76, 170, 22, 20).line("paper", 2, [87, 170], [87, 190]);
      pen.rect("paper", 118, 158, 26, 58).rect("ink", 122, 164, 18, 52);
      pen.rect("paper", 182, 164, 26, 26).rect("ink", 186, 168, 18, 18);
      pen.rect("stone", 40, 216, 188, 8).hill("green", 240, 160, 228, 244);
      // A deck chair, striped, and a jug of something.
      pen.line("wood", 4, [216, 290], [254, 238]).line("wood", 4, [240, 290], [216, 258]);
      pen.poly("rust", [228, 278], [262, 234], [274, 244], [246, 284]).line("paper", 4, [240, 280], [268, 240]);
      for (const x of [34, 62, 88]) pen.disc("sun", x, 278 + (x % 4), 6).disc("paper", x + 12, 286, 6);
    },
  },
  {
    id: "bonfire",
    name: "Brasan",
    finds: "a shore bonfire",
    draw: (pen) => {
      pen.field("deep").disc("dusk", 150, 112, 92).disc("sun", 150, 112, 62);
      pen.sea(188, "sea", "dusk");
      pen.hill("ink", 244, 150, 216, 256);
      const flames: readonly [Ink, number][] = [["rust", 1], ["sun", 0.66], ["paper", 0.3]];
      for (const [ink, size] of flames) pen.poly(ink, [150 - 72 * size, 238], [150 - 60 * size, 150], [150 - 26 * size, 182], [150 - 12 * size, 76], [150 + 22 * size, 158], [150 + 54 * size, 118], [150 + 72 * size, 238]);
      for (const side of [-1, 1]) {
        pen.line("ink", 8, [150 + side * 90, 252], [150 - side * 14, 196]);
        pen.line("ink", 6, [150 + side * 60, 258], [150 - side * 26, 224]);
      }
      for (const [x, y] of [[96, 70], [206, 54], [228, 112], [82, 134], [172, 30]] as const) pen.disc("sun", x, y, 2.5);
    },
  },
  {
    id: "sheep",
    name: "Fåren",
    finds: "sheep on the island",
    draw: (pen) => {
      pen.field("sky").sea(150, "sea", "paper").poly("pink", [186, 158], [228, 128], [272, 134], [300, 152], [300, 164], [186, 164]);
      pen.hill("moss", 196, 150, 170, 196).hill("green", 248, 150, 232, 252);
      const sheep = (x: number, y: number, size: number, flip: number) => {
        for (const leg of [-0.5, -0.2, 0.3, 0.55]) pen.rect("ink", x + leg * size * flip - 3, y + size * 0.3, 6, size * 0.36);
        pen.disc("paper", x, y, size * 0.72, 0.62);
        for (const [a, b] of [[-0.45, -0.2], [0, -0.3], [0.42, -0.18], [-0.6, 0.12], [0.6, 0.14]] as const) pen.disc("paper", x + a * size, y + b * size, size * 0.28);
        pen.disc("ink", x + flip * size * 0.82, y - size * 0.18, size * 0.2, 1.3).poly("ink", [x + flip * size * 0.72, y - size * 0.34], [x + flip * size * 0.52, y - size * 0.5], [x + flip * size * 0.64, y - size * 0.24]);
      };
      sheep(104, 214, 62, 1);
      sheep(228, 188, 34, -1);
      sheep(218, 280, 44, -1);
      for (const [x, y] of [[40, 290], [66, 316], [120, 306], [270, 320]] as const) pen.disc("sun", x, y, 5).disc("paper", x + 10, y + 6, 4);
    },
  },
  {
    id: "skerry-sail",
    name: "Allmogeseglaren",
    finds: "sailing the archipelago",
    draw: (pen) => {
      pen.field("dusk").disc("sun", 82, 96, 36).sea(208);
      pen.poly("pink", [188, 212], [226, 180], [268, 176], [300, 190], [300, 214]).pine(246, 182, 68).pine(276, 184, 52);
      pen.poly("pine", [0, 212], [0, 182], [46, 174], [86, 212]);
      pen.poly("red", [150, 52], [150, 214], [62, 214]).poly("rust", [160, 86], [160, 214], [222, 214]);
      pen.line("ink", 4, [154, 44], [154, 232]);
      pen.poly("wood", [54, 226], [244, 220], [214, 262], [86, 262]);
      pen.line("paper", 3, [54, 228], [244, 222]).line("ink", 2, [76, 244], [226, 240]);
    },
  },
];

/** A row of perforation bites along an edge, as arcs into a path already at the row's start. */
function teeth(ctx: Canvas2D, from: Point, to: Point, count: number) {
  const [dx, dy] = [(to[0] - from[0]) / count, (to[1] - from[1]) / count];
  const length = Math.hypot(dx, dy);
  const [ux, uy] = [dx / length, dy / length];
  const startAngle = Math.atan2(uy, ux);
  for (let tooth = 0; tooth < count; tooth++) {
    const [cx, cy] = [from[0] + dx * (tooth + 0.5), from[1] + dy * (tooth + 0.5)];
    ctx.lineTo(cx - ux * TOOTH * 0.5, cy - uy * TOOTH * 0.5);
    ctx.arc(cx, cy, TOOTH * 0.5, startAngle + Math.PI, startAngle, true);
    ctx.lineTo(from[0] + dx * (tooth + 1), from[1] + dy * (tooth + 1));
  }
}

/** The stamp's edge, perforated all round, as the current path. */
function perforated(ctx: Canvas2D) {
  const [w, h] = [STAMP_WIDTH, STAMP_HEIGHT];
  ctx.beginPath();
  ctx.moveTo(0, 0);
  teeth(ctx, [0, 0], [w, 0], TEETH_WIDE);
  teeth(ctx, [w, 0], [w, h], TEETH_TALL);
  teeth(ctx, [w, h], [0, h], TEETH_WIDE);
  teeth(ctx, [0, h], [0, 0], TEETH_TALL);
  ctx.closePath();
}

/** ÅLAND, set in letters of our own so no font can change it. `height` is the capitals'. */
function word(ctx: Canvas2D, x: number, y: number, height: number, ink: string) {
  const weight = height * 0.2;
  const wide = height * 0.78;
  const a = (at: number) => {
    ctx.beginPath();
    ctx.moveTo(at, y + height);
    ctx.lineTo(at + wide / 2, y);
    ctx.lineTo(at + wide, y + height);
    ctx.moveTo(at + wide * 0.2, y + height * 0.66);
    ctx.lineTo(at + wide * 0.8, y + height * 0.66);
    ctx.stroke();
  };
  ctx.strokeStyle = ink;
  ctx.lineWidth = weight;
  ctx.lineCap = "butt";
  ctx.lineJoin = "miter";
  const step = wide + height * 0.3;
  a(x);
  ctx.beginPath();
  ctx.arc(x + wide / 2, y - height * 0.24, height * 0.13, 0, 2 * Math.PI);
  ctx.lineWidth = weight * 0.7;
  ctx.stroke();
  ctx.lineWidth = weight;
  ctx.beginPath();
  ctx.moveTo(x + step, y);
  ctx.lineTo(x + step, y + height - weight / 2);
  ctx.lineTo(x + step + wide * 0.62, y + height - weight / 2);
  ctx.stroke();
  a(x + step * 2 - height * 0.26);
  const n = x + step * 3 - height * 0.2;
  ctx.beginPath();
  ctx.moveTo(n, y + height);
  ctx.lineTo(n, y);
  ctx.lineTo(n + wide * 0.9, y + height);
  ctx.lineTo(n + wide * 0.9, y);
  ctx.stroke();
  const d = x + step * 4 - height * 0.16;
  ctx.beginPath();
  ctx.moveTo(d, y + weight / 2);
  ctx.lineTo(d + wide * 0.35, y + weight / 2);
  ctx.quadraticCurveTo(d + wide, y + weight / 2, d + wide, y + height / 2);
  ctx.quadraticCurveTo(d + wide, y + height - weight / 2, d + wide * 0.35, y + height - weight / 2);
  ctx.lineTo(d, y + height - weight / 2);
  ctx.closePath();
  ctx.stroke();
}

export interface StampPlace {
  x: number;
  y: number;
  /** The stamp's width in the canvas's units. */
  width: number;
  /** A turn, about the stamp's middle, in radians. */
  turn?: number;
  /** The soft edge it casts on what's under it, in the canvas's units. */
  shadow?: { colour: string; blur: number; drop: number };
}

/** One stamp in a canvas, with its paper, its perforations, its picture and its legend. */
export function drawStamp(ctx: Canvas2D, design: StampDesign, inks: InkSet, { x, y, width, turn = 0, shadow }: StampPlace) {
  const scale = width / STAMP_WIDTH;
  ctx.save();
  ctx.translate(x + width / 2, y + (STAMP_HEIGHT * scale) / 2);
  ctx.rotate(turn);
  ctx.scale(scale, scale);
  ctx.translate(-STAMP_WIDTH / 2, -STAMP_HEIGHT / 2);
  perforated(ctx);
  ctx.save();
  if (shadow !== undefined) {
    ctx.shadowColor = shadow.colour;
    ctx.shadowBlur = shadow.blur;
    ctx.shadowOffsetY = shadow.drop;
  }
  ctx.fillStyle = inks.paper;
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(MARGIN, MARGIN);
  ctx.beginPath();
  ctx.rect(0, 0, PICTURE_WIDTH, PICTURE_HEIGHT);
  ctx.clip();
  design.draw(new Pen(ctx, inks));
  ctx.restore();
  ctx.strokeStyle = inks.ink;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(MARGIN, MARGIN, PICTURE_WIDTH, PICTURE_HEIGHT);
  word(ctx, MARGIN + 2, MARGIN + PICTURE_HEIGHT + 21, 25, inks.ink);
  ctx.fillStyle = inks.ink;
  ctx.font = `700 26px ${STAMP_FONT}`;
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(String(STAMPS.indexOf(design) + 1), STAMP_WIDTH - MARGIN - 2, MARGIN + PICTURE_HEIGHT + 46);
  ctx.restore();
}

export const STAMP_FONT = 'system-ui, "Segoe UI", Arial, sans-serif';
