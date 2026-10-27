// Turns the Poly by Google models in models/selection.json into the game's
// web-ready GLBs (public/whisker-hollow/poly/<id>.glb) and writes the
// manifest models/poly-models.ts.
//
//   npm run whisker:models [-- --cache <dir>] [-- --only <id>,<id>]
//
// Raw downloads are cached outside the repo (default ~/.cache/whisker-hollow-poly).

import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { availableParallelism, homedir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { Document, Logger, NodeIO, getBounds } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  clearNodeTransform,
  dedup,
  flatten,
  join,
  meshopt,
  prune,
  textureCompress,
  weld,
} from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";

const TEXTURE_LIMIT = 512;

const ROOT = path.resolve(import.meta.dirname, "../../../..");
const SELECTION = path.join(import.meta.dirname, "../models/selection.json");
const MANIFEST = path.join(import.meta.dirname, "../models/poly-models.ts");
const OUT_DIR = path.join(ROOT, "public/whisker-hollow/poly");

interface Selected {
  id: string;
  title: string;
  kind: "animal" | "junk";
  category: string;
  duplicateOf: string | null;
  page: string;
  glb: string;
}

interface Built extends Selected {
  tris: number;
  footprint: { x: number; z: number };
  rawBytes: number;
  bytes: number;
}

async function readSelection(): Promise<Selected[]> {
  const selection = JSON.parse(await readFile(SELECTION, "utf8")) as Selected[];
  const ids = new Set(selection.map((model) => model.id));
  if (ids.size !== selection.length) throw new Error("selection.json repeats an id");
  for (const model of selection) {
    if (!/^[\w-]+$/.test(model.id)) throw new Error(`${model.id} isn't a poly.pizza id`);
    if (model.duplicateOf !== null && !ids.has(model.duplicateOf)) {
      throw new Error(`${model.id} duplicates ${model.duplicateOf}, which isn't selected`);
    }
  }
  return selection;
}

async function rawGlb(model: Selected, cache: string): Promise<Uint8Array> {
  const file = path.join(cache, `${model.id}.glb`);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the cache folder given on the command line, and an id checked above
  if (existsSync(file)) return readFile(file);
  const response = await fetch(model.glb);
  if (!response.ok) throw new Error(`${model.id}: ${model.glb} answered ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- as above
  await writeFile(file, bytes);
  return bytes;
}

// Stands the model on y = 0, centred on its footprint, exactly 1 tall, and
// bakes that into the vertices so every mesh sits at the scene's root.
function normalise(document: Document): { x: number; z: number } {
  const scene = document.getRoot().getDefaultScene() ?? document.getRoot().listScenes()[0];
  const { min, max } = getBounds(scene);
  const height = max[1] - min[1];
  if (!(height > 0)) throw new Error("model has no height");
  const scale = 1 / height;
  const pivot = document
    .createNode("pivot")
    .setScale([scale, scale, scale])
    .setTranslation([
      (-(min[0] + max[0]) / 2) * scale,
      -min[1] * scale,
      (-(min[2] + max[2]) / 2) * scale,
    ]);
  for (const child of scene.listChildren()) pivot.addChild(child);
  scene.addChild(pivot);
  return { x: (max[0] - min[0]) * scale, z: (max[2] - min[2]) * scale };
}

function countTris(document: Document): number {
  let tris = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const count = primitive.getIndices()?.getCount() ?? primitive.getAttribute("POSITION")?.getCount() ?? 0;
      tris += count / 3;
    }
  }
  return tris;
}

async function build(io: NodeIO, model: Selected, cache: string): Promise<Built> {
  const raw = await rawGlb(model, cache);
  const document = await io.readBinary(raw);
  await document.transform(dedup(), prune());
  const footprint = normalise(document);
  await document.transform(flatten());
  for (const node of document.getRoot().listNodes()) {
    if (node.getMesh()) clearNodeTransform(node);
  }
  await document.transform(
    prune(),
    dedup(),
    join(),
    weld(),
    prune(),
    textureCompress({ encoder: sharp, targetFormat: "webp", resize: [TEXTURE_LIMIT, TEXTURE_LIMIT] }),
  );
  const tris = countTris(document);
  await document.transform(meshopt({ encoder: MeshoptEncoder, level: "medium" }));
  const bytes = await io.writeBinary(document);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the project's own public folder, and an id checked when the selection was read
  await writeFile(path.join(OUT_DIR, `${model.id}.glb`), bytes);
  return { ...model, tris, footprint, rawBytes: raw.byteLength, bytes: bytes.byteLength };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function manifest(built: readonly Built[]): string {
  const rows = built.map(
    (m) =>
      `  { id: ${JSON.stringify(m.id)}, title: ${JSON.stringify(m.title)}, kind: ${JSON.stringify(m.kind)}, ` +
      `category: ${JSON.stringify(m.category)}, duplicateOf: ${JSON.stringify(m.duplicateOf)}, tris: ${m.tris}, ` +
      `footprint: { x: ${round(m.footprint.x)}, z: ${round(m.footprint.z)} }, page: ${JSON.stringify(m.page)} },`,
  );
  return `// Generated by tools/build-poly-models.ts from models/selection.json: never edit by hand.
// Each model's file is public/whisker-hollow/poly/<id>.glb, standing on y = 0,
// centred on its footprint, exactly 1 tall; footprint is its width (x) and depth (z) at that height.

export const POLY_AUTHOR = "Poly by Google";

export type PolyModelKind = "animal" | "junk";

export interface PolyModel {
  readonly id: string;
  readonly title: string;
  readonly kind: PolyModelKind;
  readonly category: string;
  // Another file of the same animal, so the two make a pair.
  readonly duplicateOf: string | null;
  readonly tris: number;
  readonly footprint: { readonly x: number; readonly z: number };
  readonly page: string;
}

export const POLY_MODELS: readonly PolyModel[] = [
${rows.join("\n")}
];
`;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      cache: { type: "string", default: path.join(homedir(), ".cache/whisker-hollow-poly") },
      only: { type: "string" },
    },
  });
  const selection = await readSelection();
  const only = values.only === undefined ? null : new Set(values.only.split(","));
  const todo = only === null ? selection : selection.filter((model) => only.has(model.id));
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the cache folder given on the command line
  await mkdir(values.cache, { recursive: true });
  await mkdir(OUT_DIR, { recursive: true });

  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .setLogger(new Logger(Logger.Verbosity.WARN))
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });

  const started = performance.now();
  const built: Built[] = [];
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < todo.length) {
      const model = todo[next++];
      built.push(await build(io, model, values.cache));
      if (process.stdout.isTTY) process.stdout.write(`\r${built.length}/${todo.length}`);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.floor(availableParallelism() / 2)) }, worker));
  if (process.stdout.isTTY) process.stdout.write("\n");

  if (only === null) {
    const keep = new Set(selection.map((model) => `${model.id}.glb`));
    for (const file of await readdir(OUT_DIR)) {
      if (!keep.has(file)) await rm(path.join(OUT_DIR, file));
    }
    const order = new Map(selection.map((model, index) => [model.id, index]));
    built.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    await writeFile(MANIFEST, manifest(built));
  }

  const mb = (bytes: number): string => `${(bytes / 1e6).toFixed(1)} MB`;
  for (const kind of ["animal", "junk"] as const) {
    const ofKind = built.filter((model) => model.kind === kind);
    const raw = ofKind.reduce((sum, model) => sum + model.rawBytes, 0);
    const out = ofKind.reduce((sum, model) => sum + model.bytes, 0);
    console.log(`${kind}: ${ofKind.length} models, ${mb(raw)} raw -> ${mb(out)}`);
  }
  console.log(`done in ${((performance.now() - started) / 1000).toFixed(0)} s`);
}

await main();
