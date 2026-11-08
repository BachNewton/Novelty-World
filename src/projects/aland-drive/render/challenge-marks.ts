import { BufferAttribute, BufferGeometry, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, MeshBasicNodeMaterial, type Node, type Scene } from "three/webgpu";
import { attribute, float, mix, select } from "three/tsl";
import { START_RING_M } from "../challenge/board";
import type { Gate, RaceGround, ScenePoint } from "../challenge/types";

/*
 * What a challenge puts in the world, made here from boxes and prisms, flat
 * shaded in the challenge's own colours: every start's ring of short posts, a
 * race's in its ground's colour,
 * with a tall pale beam over it that marks it from kilometres off, and during
 * a run the one line the car is to cross next, as an arch over the road (the
 * finish's banner chequered) or a dark gantry with its camera for a Speed
 * trap. The posts and beams are one instanced list each, and the line one
 * small mesh rebuilt when it changes: three draw calls in all.
 *
 * Each post and arch stands on the ground as the world has it, which sharpens
 * as tiles land, so the heights are read again whenever the world's heights
 * change and the lists written only when one has moved.
 */

export interface ChallengeMarksInputs {
  colour: (name: string) => Node<"vec3">;
  hazed: (colour: Node<"vec3">) => Node<"vec3">;
  /** Degrees clockwise from north. */
  sunAzimuthDeg: number;
  groundAt: (x: number, z: number) => number;
}

/** How a start ring is painted: a challenge's, passed or not, or a race's by what's under its wheels. */
export type StartTone = "challenge" | "passed" | RaceGround;

const TONES: readonly StartTone[] = ["challenge", "passed", "road", "cross-country", "off-road"];

/** A start ring on the ground, and how it's painted. */
export interface StartMark extends ScenePoint {
  tone: StartTone;
}

export type LineLook = "gate" | "finish" | "camera";

const POSTS_A_RING = 20;
const POST_RADIUS_M = 0.18;
const POST_TALL_M = 1.1;
const BEAM_RADIUS_M = 1.1;
const BEAM_TALL_M = 160;
const BEAM_OPACITY = 0.5;
const SIDES = 6;
const ARCH_TALL_M = 5.2;
const ARCH_POST_M = 0.45;
const BAR_TALL_M = 0.55;
const BANNER_TALL_M = 1.3;
const CHEQUER_M = 0.65;
const HOUSING_M = [1.1, 0.8, 0.9] as const;
/** A post or an arch moves only once the ground under it has moved this much. */
const REREAD_M = 0.05;

/** What a face is painted with: the mark's colour, the finish's chequer, or the camera's dark. */
const PLAIN = 0;
const CHEQUER = 1;
const DARK = 2;

/** Flat faces, each with its own light: brighter facing the sun, brightest on top, and what it's painted with. */
class Faces {
  readonly positions: number[] = [];
  readonly shades: number[] = [];
  /** The paint, then the face's own metres across and up, which the chequer is laid in. */
  readonly paints: number[] = [];

  constructor(private readonly sun: { x: number; z: number }) {}

  /** A quad from four corners, anticlockwise seen from outside, with its outward way across the ground. */
  quad(corners: [number, number, number][], outward: { x: number; z: number } | "up", paint = PLAIN, metres: [number, number][] = [[0, 0], [0, 0], [0, 0], [0, 0]]): void {
    const shade = outward === "up" ? 1 : 0.68 + 0.24 * Math.max(0, outward.x * this.sun.x + outward.z * this.sun.z);
    for (const index of [0, 1, 2, 0, 2, 3]) {
      this.positions.push(...corners[index]);
      this.shades.push(shade);
      this.paints.push(paint, ...metres[index]);
    }
  }

  /** An upright prism round a point, from one height to another, with a top. */
  prism(x: number, z: number, radius: number, from: number, to: number, sides: number, top: boolean): void {
    const at = (side: number): [number, number] => [x + radius * Math.cos((side * 2 * Math.PI) / sides), z + radius * Math.sin((side * 2 * Math.PI) / sides)];
    for (let side = 0; side < sides; side++) {
      const [ax, az] = at(side);
      const [bx, bz] = at(side + 1);
      const middle = ((side + 0.5) * 2 * Math.PI) / sides;
      this.quad([[ax, from, az], [ax, to, az], [bx, to, bz], [bx, from, bz]], { x: Math.cos(middle), z: Math.sin(middle) });
    }
    if (!top) return;
    const [ax, az] = at(0);
    for (let side = 1; side + 1 < sides; side++) {
      const [bx, bz] = at(side);
      const [cx, cz] = at(side + 1);
      for (const corner of [[ax, to, az], [bx, to, bz], [cx, to, cz]]) {
        this.positions.push(...corner);
        this.shades.push(1);
        this.paints.push(PLAIN, 0, 0);
      }
    }
  }

  /** A box along a horizontal way, from its middle, with each side's half size: along, up, across. */
  box(middle: [number, number, number], along: { x: number; z: number }, [halfAlong, halfUp, halfAcross]: readonly [number, number, number], paint = PLAIN, chequered = false): void {
    const across = { x: -along.z, z: along.x };
    const corner = (a: number, u: number, c: number): [number, number, number] => [middle[0] + a * halfAlong * along.x + c * halfAcross * across.x, middle[1] + u * halfUp, middle[2] + a * halfAlong * along.z + c * halfAcross * across.z];
    const metres = (a: number, u: number): [number, number] => [a * halfAlong, u * halfUp];
    const sideMetres: [number, number][] = [metres(-1, -1), metres(-1, 1), metres(1, 1), metres(1, -1)];
    const facePaint = chequered ? CHEQUER : paint;
    this.quad([corner(-1, -1, 1), corner(-1, 1, 1), corner(1, 1, 1), corner(1, -1, 1)], across, facePaint, sideMetres);
    this.quad([corner(1, -1, -1), corner(1, 1, -1), corner(-1, 1, -1), corner(-1, -1, -1)], { x: -across.x, z: -across.z }, facePaint, sideMetres.map(([a, u]) => [-a, u]));
    this.quad([corner(1, -1, 1), corner(1, 1, 1), corner(1, 1, -1), corner(1, -1, -1)], along, paint);
    this.quad([corner(-1, -1, -1), corner(-1, 1, -1), corner(-1, 1, 1), corner(-1, -1, 1)], { x: -along.x, z: -along.z }, paint);
    this.quad([corner(-1, 1, 1), corner(-1, 1, -1), corner(1, 1, -1), corner(1, 1, 1)], "up", paint);
  }

  geometry(): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(Float32Array.from(this.positions), 3));
    geometry.setAttribute("shade", new BufferAttribute(Float32Array.from(this.shades), 1));
    geometry.setAttribute("paint", new BufferAttribute(Float32Array.from(this.paints), 3));
    return geometry;
  }
}

const forwardOf = (heading: number) => ({ x: -Math.sin(heading), z: -Math.cos(heading) });

export function createChallengeMarks(scene: Scene, { colour, hazed, sunAzimuthDeg, groundAt }: ChallengeMarksInputs, capacity: number) {
  const sunRadians = (sunAzimuthDeg * Math.PI) / 180;
  const sun = { x: Math.sin(sunRadians), z: -Math.cos(sunRadians) };
  const shade = attribute<"float">("shade", "float");
  const tone = attribute<"float">("tone", "float");
  const toneColours = [colour("challenge-mark"), colour("challenge-passed"), colour("race-road"), colour("race-cross-country"), colour("race-off-road")];
  const mark = toneColours.slice(1).reduce((chosen, each, index) => select(tone.greaterThan(index + 0.5), each, chosen), toneColours[0]);

  const postFaces = new Faces(sun);
  postFaces.prism(0, 0, POST_RADIUS_M, -0.5, POST_TALL_M, SIDES, true);
  const postGeometry = postFaces.geometry();
  const postTone = new InstancedBufferAttribute(new Float32Array(capacity * POSTS_A_RING), 1);
  postGeometry.setAttribute("tone", postTone);
  const postMaterial = new MeshBasicNodeMaterial();
  postMaterial.name = "challenge-posts";
  postMaterial.colorNode = hazed(mark.mul(shade));
  // Few enough faces that both sides are drawn rather than each wound by hand.
  postMaterial.side = 2;
  const posts = new InstancedMesh(postGeometry, postMaterial, capacity * POSTS_A_RING);
  posts.frustumCulled = false;
  posts.count = 0;
  scene.add(posts);

  const beamFaces = new Faces(sun);
  beamFaces.prism(0, 0, BEAM_RADIUS_M, 0, BEAM_TALL_M, SIDES, false);
  const beamGeometry = beamFaces.geometry();
  const beamTone = new InstancedBufferAttribute(new Float32Array(capacity), 1);
  beamGeometry.setAttribute("tone", beamTone);
  const rise = attribute<"vec3">("position", "vec3").y.div(BEAM_TALL_M);
  const beamMaterial = new MeshBasicNodeMaterial();
  beamMaterial.name = "challenge-beams";
  beamMaterial.colorNode = hazed(mix(mark, colour("challenge-light"), rise.mul(0.5)));
  beamMaterial.opacityNode = float(1).sub(rise).pow(1.5).mul(BEAM_OPACITY);
  beamMaterial.transparent = true;
  beamMaterial.depthWrite = false;
  beamMaterial.side = 2;
  const beams = new InstancedMesh(beamGeometry, beamMaterial, capacity);
  beams.frustumCulled = false;
  beams.count = 0;
  scene.add(beams);

  const paint = attribute<"vec3">("paint", "vec3");
  const chequer = paint.y.div(CHEQUER_M).floor().add(paint.z.div(CHEQUER_M).floor()).mod(2);
  const chequered = mix(colour("challenge-light"), colour("challenge-dark"), chequer);
  const painted = mix(mix(colour("challenge-mark"), chequered, paint.x.min(1)), colour("challenge-dark"), paint.x.sub(1).max(0));
  const lineMaterial = new MeshBasicNodeMaterial();
  lineMaterial.name = "challenge-lines";
  lineMaterial.colorNode = hazed(painted.mul(shade));
  lineMaterial.side = 2;
  const line = new Mesh(new BufferGeometry(), lineMaterial);
  line.frustumCulled = false;
  line.visible = false;
  scene.add(line);

  let starts: readonly StartMark[] = [];
  let startsShown = true;
  /** Each post's ground and each beam's, as last written. */
  let postGround = new Float32Array(0);
  let shownLine: { gate: Gate; look: LineLook; grounds: [number, number] } | null = null;
  let compiling = false;
  let groundShown = -1;
  const matrix = new Matrix4();

  const postAt = (ring: number, post: number) => {
    const { x, z } = starts[ring];
    const angle = (post * 2 * Math.PI) / POSTS_A_RING;
    return { x: x + START_RING_M * Math.cos(angle), z: z + START_RING_M * Math.sin(angle) };
  };

  /** The posts and beams on the ground as it is now, written only where it has moved. */
  const placeStarts = (force: boolean) => {
    let moved = force;
    for (let ring = 0; ring < starts.length; ring++) {
      for (let post = 0; post < POSTS_A_RING; post++) {
        const index = ring * POSTS_A_RING + post;
        const { x, z } = postAt(ring, post);
        const ground = groundAt(x, z);
        if (!force && Math.abs(ground - postGround[index]) < REREAD_M) continue;
        postGround[index] = ground;
        posts.setMatrixAt(index, matrix.makeTranslation(x, ground, z));
        moved = true;
      }
    }
    if (!moved) return;
    posts.instanceMatrix.needsUpdate = true;
    for (let ring = 0; ring < starts.length; ring++) {
      const { x, z } = starts[ring];
      beams.setMatrixAt(ring, matrix.makeTranslation(x, groundAt(x, z), z));
    }
    beams.instanceMatrix.needsUpdate = true;
  };

  const buildLine = (gate: Gate, look: LineLook, grounds: [number, number]) => {
    const faces = new Faces(sun);
    const forward = forwardOf(gate.heading);
    const right = { x: -forward.z, z: forward.x };
    const top = Math.max(...grounds) + ARCH_TALL_M;
    const ends = [-1, 1].map((side) => ({ x: gate.x + side * gate.halfWidthM * right.x, z: gate.z + side * gate.halfWidthM * right.z }));
    ends.forEach(({ x, z }, end) => {
      const ground = grounds[end];
      faces.box([x, (ground - 0.5 + top) / 2, z], forward, [ARCH_POST_M / 2, (top - ground + 0.5) / 2, ARCH_POST_M / 2], look === "camera" ? DARK : PLAIN);
    });
    const barHalf = gate.halfWidthM + ARCH_POST_M / 2;
    if (look === "finish") faces.box([gate.x, top - BANNER_TALL_M / 2, gate.z], right, [barHalf, BANNER_TALL_M / 2, 0.08], PLAIN, true);
    else faces.box([gate.x, top - BAR_TALL_M / 2, gate.z], right, [barHalf, BAR_TALL_M / 2, 0.2], look === "camera" ? DARK : PLAIN);
    if (look === "camera") {
      // The camera hangs under the gantry's middle, looking back down the road at the cars coming.
      const [halfAlong, halfUp, halfAcross] = HOUSING_M.map((size) => size / 2);
      faces.box([gate.x, top - BAR_TALL_M - halfUp, gate.z], forward, [halfAlong, halfUp, halfAcross], DARK);
      faces.box([gate.x - forward.x * (halfAlong + 0.05), top - BAR_TALL_M - halfUp, gate.z - forward.z * (halfAlong + 0.05)], forward, [0.05, halfUp * 0.6, halfAcross * 0.6], PLAIN);
    }
    line.geometry.dispose();
    line.geometry = faces.geometry();
    shownLine = { gate, look, grounds };
  };

  const groundsOf = (gate: Gate): [number, number] => {
    const forward = forwardOf(gate.heading);
    const right = { x: -forward.z, z: forward.x };
    return [groundAt(gate.x - gate.halfWidthM * right.x, gate.z - gate.halfWidthM * right.z), groundAt(gate.x + gate.halfWidthM * right.x, gate.z + gate.halfWidthM * right.z)];
  };

  return {
    /** Every start ring in this world. */
    setStarts(next: readonly StartMark[]): void {
      if (next.length > capacity) throw new Error(`${next.length} challenge starts, past the ${capacity} the lists hold`);
      starts = next;
      postGround = new Float32Array(next.length * POSTS_A_RING);
      next.forEach(({ tone: painted }, ring) => {
        postTone.array.fill(TONES.indexOf(painted), ring * POSTS_A_RING, (ring + 1) * POSTS_A_RING);
        beamTone.array[ring] = TONES.indexOf(painted);
      });
      postTone.needsUpdate = true;
      beamTone.needsUpdate = true;
      posts.count = startsShown ? next.length * POSTS_A_RING : 0;
      beams.count = startsShown ? next.length : 0;
      placeStarts(true);
    },
    /** The rings are put away during a run. */
    showStarts(shown: boolean): void {
      startsShown = shown;
      posts.count = shown ? starts.length * POSTS_A_RING : 0;
      beams.count = shown ? starts.length : 0;
    },
    /** The line to cross next, or none. */
    setLine(gate: Gate | null, look: LineLook): void {
      if (!gate) {
        line.visible = false;
        shownLine = null;
        return;
      }
      line.visible = true;
      if (shownLine?.gate !== gate || shownLine.look !== look) buildLine(gate, look, groundsOf(gate));
    },
    /** Each frame, given a number that moves whenever the world's heights do: what stands on the ground follows it as it sharpens. */
    update(groundRevision: number): void {
      if (groundRevision === groundShown) return;
      groundShown = groundRevision;
      if (startsShown) placeStarts(false);
      if (shownLine) {
        const grounds = groundsOf(shownLine.gate);
        if (grounds.some((ground, end) => Math.abs(ground - (shownLine?.grounds[end] ?? ground)) >= REREAD_M)) buildLine(shownLine.gate, shownLine.look, grounds);
      }
    },
    /** Everything shown at once, so every pipeline is built before the drive starts. */
    showAll(shown: boolean): void {
      if (shown) {
        posts.count = Math.max(posts.count, 1);
        beams.count = Math.max(beams.count, 1);
        if (!shownLine) {
          compiling = true;
          buildLine({ x: 0, z: 0, heading: 0, halfWidthM: 1 }, "camera", [0, 0]);
        }
        line.visible = true;
      } else {
        posts.count = startsShown ? starts.length * POSTS_A_RING : 0;
        beams.count = startsShown ? starts.length : 0;
        if (compiling) shownLine = null;
        compiling = false;
        line.visible = shownLine !== null;
      }
    },
    dispose(): void {
      for (const object of [posts, beams, line]) {
        scene.remove(object);
        object.geometry.dispose();
      }
      postMaterial.dispose();
      beamMaterial.dispose();
      lineMaterial.dispose();
    },
  };
}

export type ChallengeMarks = ReturnType<typeof createChallengeMarks>;
