import { BackSide, ClampToEdgeWrapping, HalfFloatType, LinearSRGBColorSpace, LinearFilter, Matrix4, MeshBasicNodeMaterial, Quaternion, RenderTarget, RGBAFormat, Vector3, type Node, type PerspectiveCamera, type Scene, type WebGPURenderer } from "three/webgpu";
import { cameraPosition, float, Fn, mix, positionWorld, select, smoothstep, texture, vec2, vec3 } from "three/tsl";
import { sharedUniform } from "../art/shared-uniform";

/*
 * The island through a dealership's windows. On entering, the game's own frame draws the world six times from the
 * dealership's real place, a square image looking each way along the world's axes, so every system that culls by the
 * camera (the forest, the terrain's rings, the placed lists) culls for that face. The room is then drawn in front of
 * them: the sky dome shows them wherever the room is open, and a window's pane shows them with a touch of glass over it.
 *
 * Six plain images rather than a cube texture: a pixel finds its face and its place on it from the very camera that
 * face was drawn with (`FACES`), so the drawing and the reading can't disagree about which way is up.
 *
 * A pipeline is built for the target it draws into, so each face is drawn into a target alike to the one three draws
 * the screen's scene into (its colour, depth and samples) and copied out to its image: the capture uses the world's
 * own pipelines and compiles none. A target of any other kind compiled the whole world again at the start. three keeps
 * one render context for every target of a kind, so this target shares the screen's: it is freed only on leaving, once
 * the room's frames have pointed that context back at the screen's own buffers.
 *
 * The images hold directions, as if everything were far off, so the ground near the windows would slide as the player
 * walks. Looking down, each pixel finds where its ray meets the ground and looks that way from where the island was
 * captured, which keeps the forecourt still; far off, and looking up, the direction is used as it is.
 */

/** Each face's side, in pixels. A window filling the screen at the floor's 3440 wide spans about this much of a face. */
const FACE_PX = 1536;
/** Frames drawn into the first face before it counts, so every system following the camera has moved to the new place. */
const SETTLE_FRAMES = 2;
const CAPTURE_FOV = 90;
/** Past this the ground is far enough off that the direction alone is right. */
const NEAR_GROUND_M = 40;
const FAR_GROUND_M = 400;
const GLASS_TINT = 0.9;
const GLASS_SHEEN = 0.12;

/** The six faces, each the way it looks and the way that is up in its image: +x, -x, +y, -y, +z, -z. */
const FACES: readonly { forward: Vector3; up: Vector3 }[] = [
  { forward: new Vector3(1, 0, 0), up: new Vector3(0, 1, 0) },
  { forward: new Vector3(-1, 0, 0), up: new Vector3(0, 1, 0) },
  { forward: new Vector3(0, 1, 0), up: new Vector3(0, 0, 1) },
  { forward: new Vector3(0, -1, 0), up: new Vector3(0, 0, -1) },
  { forward: new Vector3(0, 0, 1), up: new Vector3(0, 1, 0) },
  { forward: new Vector3(0, 0, -1), up: new Vector3(0, 1, 0) },
];
const rightOf = ({ forward, up }: (typeof FACES)[number]) => forward.clone().cross(up);
/** A camera's turn for a face: its +x the face's right, +y its up, and -z the way it looks. */
const turnOf = (face: (typeof FACES)[number]) => new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(rightOf(face), face.up, face.forward.clone().negate()));

/** Where the island is captured from and how the room's frame turns into the world's. */
export interface CapturePlace {
  /** The capture point in the world. */
  at: Vector3;
  /** The room's yaw on the island. */
  yaw: number;
  /** The capture point in the room's frame, and the ground's height there. */
  inRoom: Vector3;
  groundY: number;
}

/** A face's image: what the drawing is copied into, and what the view reads. */
const faceImage = (size: number) => {
  const target = new RenderTarget(size, size, { type: HalfFloatType, format: RGBAFormat, colorSpace: LinearSRGBColorSpace, depthBuffer: false, generateMipmaps: false, minFilter: LinearFilter, magFilter: LinearFilter });
  target.texture.wrapS = target.texture.wrapT = ClampToEdgeWrapping;
  return target;
};

export function createIslandView(renderer: WebGPURenderer) {
  /** Where a face is drawn: three's own scene target's kind (`_getFrameBufferTarget`, in three's working colour space), so its pipelines are the world's. */
  const drawingTarget = () =>
    new RenderTarget(FACE_PX, FACE_PX, { type: HalfFloatType, format: RGBAFormat, colorSpace: LinearSRGBColorSpace, samples: renderer.samples, depthBuffer: renderer.depth, stencilBuffer: renderer.stencil, generateMipmaps: false });
  // Small images to show before the first capture: one each, since three binds texture nodes that start on one texture
  // as one, and every face then read the same image.
  const placeholders = FACES.map(() => faceImage(16));
  let targets: RenderTarget[] | null = null;
  let drawing: RenderTarget | null = null;
  const turns = FACES.map(turnOf);
  const images = placeholders.map((placeholder) => texture(placeholder.texture));

  const captured = sharedUniform(new Vector3());
  const groundY = sharedUniform(0);
  const turn = sharedUniform(new Vector3(1, 0, 0));

  /** The island's colour seen from the eye along a direction, both in the room's frame. */
  const seen = Fn(([eye, direction]: [Node<"vec3">, Node<"vec3">]) => {
    const down = direction.y.lessThan(-1e-3);
    const toGround = eye.y.sub(groundY).div(direction.y.negate().max(1e-3));
    const onGround = eye.add(direction.mul(toGround)).sub(captured).normalize();
    const look = select(down, mix(onGround, direction, smoothstep(float(NEAR_GROUND_M), float(FAR_GROUND_M), toGround)), direction).normalize();
    // The room's frame turned into the world's, about +y by the room's yaw.
    const d = vec3(look.x.mul(turn.x).add(look.z.mul(turn.y)), look.y, look.z.mul(turn.x).sub(look.x.mul(turn.y))).toVar();
    // Every face is read, each where the direction falls on its plane, and the one it points through is kept: a texture
    // is read only where every pixel of a quad reads it.
    const colours = FACES.map((face, index) => {
      const right = rightOf(face);
      const ahead = d.dot(vec3(face.forward.x, face.forward.y, face.forward.z)).max(1e-4);
      const x = d.dot(vec3(right.x, right.y, right.z)).div(ahead);
      const y = d.dot(vec3(face.up.x, face.up.y, face.up.z)).div(ahead);
      return images[index].sample(vec2(x.mul(0.5).add(0.5), float(0.5).sub(y.mul(0.5)))).rgb.toVar();
    });
    const [ax, ay, az] = [d.x.abs(), d.y.abs(), d.z.abs()];
    const alongX = ax.greaterThanEqual(ay).and(ax.greaterThanEqual(az));
    const alongY = ay.greaterThan(ax).and(ay.greaterThanEqual(az));
    return select(alongX, select(d.x.greaterThan(0), colours[0], colours[1]), select(alongY, select(d.y.greaterThan(0), colours[2], colours[3]), select(d.z.greaterThan(0), colours[4], colours[5])));
  });
  const direction = positionWorld.sub(cameraPosition).normalize();

  const sky = new MeshBasicNodeMaterial();
  sky.name = "dealer-view";
  sky.colorNode = seen(cameraPosition, direction);
  sky.side = BackSide;
  sky.depthWrite = false;

  const glass = new MeshBasicNodeMaterial();
  glass.name = "dealer-window";
  glass.colorNode = mix(seen(cameraPosition, direction).mul(GLASS_TINT), vec3(1, 1, 1), float(GLASS_SHEEN).mul(float(1).sub(direction.y.abs())));

  let place: CapturePlace | null = null;
  let frame = 0;
  let onDone: (() => void) | null = null;
  const saved = { fov: 0, aspect: 0 };

  return {
    sky,
    glass,
    /** Starts capturing the island from a place over the next frames, calling `done` once every face is in. */
    capture(next: CapturePlace, done: () => void) {
      targets ??= FACES.map(() => faceImage(FACE_PX));
      drawing ??= drawingTarget();
      targets.forEach((target, index) => (images[index].value = target.texture));
      place = next;
      frame = 0;
      onDone = done;
      captured.value.copy(next.inRoom);
      groundY.value = next.groundY;
      turn.value.set(Math.cos(next.yaw), Math.sin(next.yaw), 0);
    },
    capturing: () => place !== null,
    /** While capturing, points the game's camera at this frame's face, before anything that culls by it. */
    aim(camera: PerspectiveCamera): boolean {
      if (!place) return false;
      if (frame === 0) Object.assign(saved, { fov: camera.fov, aspect: camera.aspect });
      camera.position.copy(place.at);
      camera.quaternion.copy(turns[Math.max(0, frame - SETTLE_FRAMES)]);
      camera.fov = CAPTURE_FOV;
      camera.aspect = 1;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      return true;
    },
    /** While capturing, draws the frame into its face rather than the screen. */
    render(scene: Scene, camera: PerspectiveCamera): boolean {
      if (!place || !targets || !drawing) return false;
      renderer.setRenderTarget(drawing);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.copyTextureToTexture(drawing.texture, targets[Math.max(0, frame - SETTLE_FRAMES)].texture);
      frame++;
      if (frame === SETTLE_FRAMES + FACES.length) {
        place = null;
        camera.fov = saved.fov;
        camera.aspect = saved.aspect;
        camera.updateProjectionMatrix();
        const done = onDone;
        onDone = null;
        done?.();
      }
      return true;
    },
    /** Lets the captured view go, keeping the faces for the next. */
    release() {
      drawing?.dispose();
      drawing = null;
      images.forEach((image, index) => (image.value = placeholders[index].texture));
    },
    dispose() {
      for (const target of targets ?? []) target.dispose();
      drawing?.dispose();
      for (const placeholder of placeholders) placeholder.dispose();
      sky.dispose();
      glass.dispose();
    },
  };
}

export type IslandView = ReturnType<typeof createIslandView>;
