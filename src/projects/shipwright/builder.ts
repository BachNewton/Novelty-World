import * as THREE from "three";
import { MAIN_PASS_LAYER } from "./layers";
import { createFixture, type Fixture, type FixtureKind } from "./fixtures";
import type { Physics, VoxelHit } from "./physics";

/**
 * The first-person builder — two placement modes on top of the Rapier voxel bodies (see physics.ts).
 *
 * ## Voxel mode (default) — the Minecraft-style place/break loop
 *
 *  - LEFT click  → break the aimed voxel (physics.removeVoxel; may split the ship into two bodies), OR
 *    remove a committed fixture you're aiming at when it's nearer than the voxel behind it.
 *  - RIGHT click → place a voxel on the aimed face (physics.placeVoxel). Refused inside the sailor, and
 *    refused into a cell a committed fixture occupies.
 *  - Q           → drop a fresh, unconnected voxel just ahead (physics.dropVoxel), carrying momentum.
 *
 * Aiming uses a single world-space AIM DOT sat at the ray hit point — shown only on a buildable voxel,
 * so it doubles as a "you can build here" reticle, and dims when a place would land inside the sailor.
 *
 * ## Fixture mode — placing a helm or an electric engine (see fixtures.ts)
 *
 * Dev keys (deliberately unshown — we're in dev and memorise them; revisit for controller support):
 *
 *  - 1 → helm placement, 2 → engine placement (press its key again to return to voxel mode). Esc is NOT
 *    used — it releases pointer-lock back to the dev orbit camera.
 *
 * In fixture mode the aim dot is replaced by a translucent GHOST of the real fixture that tracks the
 * aimed cell, tinted with the same white(placeable)/grey(blocked) convention as the dot. You must aim at
 * a **top face** (a deck cell); the fixture then faces the ship cardinal nearest your look direction (no
 * rotation key — you point the way you want it to face). A helm sits on top of the cell; an engine hangs
 * off its outboard edge, facing outward. The ghost turns grey where its footprint would overlap the hull
 * or another fixture (so an engine can't be driven into the boat). RIGHT click commits a real fixture
 * (same button as placing a voxel); it rides the hull. Voxel placement is refused into a fixture's cells.
 *
 * ## Helm control — steering the ship
 *
 * Aim at a committed helm and press E to take the wheel; A/D turn it, and the angle HOLDS (no auto-centre,
 * like a real helm — the king spoke tells you when it's back at centre). The steering angle is per BODY,
 * so every helm on that hull shows it and every engine yaws its pod to match (twin wheels / twin engines
 * stay in sync — the list-first model). Walking is suspended while you hold the wheel (see player.ts
 * `controlLocked`); press E again, or leave first person, to let go. Thrust/propulsion is a later step.
 *
 * Committed fixtures currently ride via `poseVoxel` each frame (the same mechanism as the selection
 * highlight) and carry no mass. Making them physics-owned — mass/buoyancy, removal with their cell, the
 * "side is exposed" + "pod reaches water" validity checks, and the wheel→engine steering linkage — is the
 * next step and lives in physics.ts. All voxel-world mutation already lives there; this module is input +
 * the aim dot + the ghost. Creative mode: unlimited, no inventory yet (that arrives with roadmap #8).
 */

const VOXEL = 0.5; // metres — the standard building voxel (matches physics.ts)
const REACH = 5; // metres the sailor can place/break at
const AIM_DOT_RADIUS = 0.02; // metres — the world-space reticle sphere at the ray hit point
// The dot's two states. Blocked is a mid grey at reduced opacity: legible against both the pale deck
// and the dark sea, but clearly withdrawn next to the bright white of a placeable face.
const AIM_COLOR_PLACEABLE = 0xffffff;
const AIM_COLOR_BLOCKED = 0x707070;
const AIM_OPACITY_PLACEABLE = 0.9;
const AIM_OPACITY_BLOCKED = 0.55;
// The ghost reuses the dot's white/grey language at lower opacity, since it's a whole translucent solid.
const GHOST_OPACITY_PLACEABLE = 0.5;
const GHOST_OPACITY_BLOCKED = 0.3;

// Steering: A/D at a helm move a per-body angle that HOLDS (no auto-centre). The wheel spins
// WHEEL_TURN_RATIO× the pod's yaw, kept under π so "king spoke straight up" unambiguously reads as centred.
const MAX_STEER = 0.6; // rad — full-lock pod yaw (~34°)
const WHEEL_TURN_RATIO = 4;
const STEER_RATE = 0.8; // rad/s — how fast A/D move the steering while held
const HELM_HIGHLIGHT = 0x3a2c14; // warm emissive on a helm you're aiming at within reach — "press E"
const HELM_REACH = 1.5; // m — how close the sailor must be to a helm to take the wheel (right at it)
const HELM_REACH_COS = 0.6; // and looking within ~53° of it — a generous cone, not a precise mesh hit

// Player capsule (mirror of player.ts HEIGHT/RADIUS) for the anti-suffocation guard, so a placed
// voxel can't land inside the sailor. Kept in step with player.ts — the camera in first person sits
// EYE_FROM_CENTER above the capsule centre, so the body centre is the eye minus that.
const PLAYER_EYE_FROM_CENTER = 0.8;
const PLAYER_CYLINDER_HALF = 0.6;
const PLAYER_RADIUS = 0.3;
const VOXEL_HALF = VOXEL / 2;

// The build's four horizontal grid cardinals, each as a local direction + the yaw that turns a
// fixture's canonical +Z facing (see fixtures.ts) to point that way. A fixture is placed facing whichever
// of these best matches the player's look direction, so the ship's grid — not the world — sets the snap.
const LOCAL_CARDINALS: { yaw: number; dir: THREE.Vector3 }[] = [
  { yaw: 0, dir: new THREE.Vector3(0, 0, 1) },
  { yaw: Math.PI / 2, dir: new THREE.Vector3(1, 0, 0) },
  { yaw: Math.PI, dir: new THREE.Vector3(0, 0, -1) },
  { yaw: -Math.PI / 2, dir: new THREE.Vector3(-1, 0, 0) },
];

type Mode = "voxel" | FixtureKind;

/** The translucent preview shown while placing a fixture: a re-materialled fixture on a posable anchor. */
interface Ghost {
  kind: FixtureKind;
  fixture: Fixture;
  anchor: THREE.Group;
  material: THREE.MeshBasicMaterial;
  setPlaceable: (ok: boolean) => void;
}

/** A committed fixture, re-posed onto its hull cell every frame so it rides the body (heel included). */
interface Placed {
  visual: VoxelHit["visual"];
  cell: [number, number, number];
  anchor: THREE.Group;
  fixture: Fixture;
  /** Local grid cells this fixture fills, so voxel placement into them is refused. (A stopgap until
   *  fixtures are physics-owned in step 3 — then their colliders block placement the normal way.) */
  occupied: [number, number, number][];
}

export interface Builder {
  /** The builder's scene node (aim dot + ghost + committed fixtures) — add to the scene once. */
  object: THREE.Object3D;
  /** Per frame (after the camera is posed): re-aim the dot / ghost, ride the committed fixtures, and
   *  advance steering. `dt` is the render delta in seconds (for the hold-to-turn rate). */
  update: (dt: number) => void;
  /** True while the sailor is holding a helm (A/D steer; walking is suspended). */
  isSteering: () => boolean;
  /** Place a fixture programmatically (e.g. seeding the raft's default helm + engine at load), skipping
   *  the ghost/validity flow. `cardinal` indexes the ship cardinals (0:+Z, 1:+X, 2:−Z, 3:−X). */
  placeFixture: (kind: FixtureKind, visual: VoxelHit["visual"], cell: [number, number, number], cardinal: number) => void;
  /** Toggle the debug overlay drawing the grid cells each committed / previewed fixture occupies. */
  setOccupancyDebug: (on: boolean) => void;
  dispose: () => void;
}

export function createBuilder(
  camera: THREE.PerspectiveCamera,
  domElement: HTMLElement,
  physics: Physics,
  isActive: () => boolean,
  playerVelocity: () => THREE.Vector3,
): Builder {
  const root = new THREE.Group();

  // The "physical crosshair": a small sphere sat at the exact ray hit point. depthTest off + a high
  // render order so it always reads crisply on the surface it's touching instead of z-fighting it.
  const aimGeometry = new THREE.SphereGeometry(AIM_DOT_RADIUS, 12, 12);
  const aimMaterial = new THREE.MeshBasicMaterial({
    color: AIM_COLOR_PLACEABLE,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    opacity: AIM_OPACITY_PLACEABLE,
  });
  const aimDot = new THREE.Mesh(aimGeometry, aimMaterial);
  aimDot.renderOrder = 1000;
  aimDot.frustumCulled = false;
  aimDot.visible = false;
  // Main pass only: the dot is HUD, so it must draw over the water and never land in the scene
  // capture, where the water would refract it and SSR would reflect it (see layers.ts).
  aimDot.layers.set(MAIN_PASS_LAYER);
  root.add(aimDot);

  const forward = new THREE.Vector3();
  const lookFlat = new THREE.Vector3();
  const scratchDir = new THREE.Vector3();
  const helmPos = new THREE.Vector3();
  const toHelm = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  const probe = new THREE.Object3D(); // scratch, posed to the place cell for the suffocation check
  let currentHit: VoxelHit | null = null;
  let canPlace = false; // is the current place cell a legal spot (not inside the sailor)?

  let mode: Mode = "voxel";
  let ghost: Ghost | null = null;
  let ghostCardinal = 0; // the cardinal the ghost is currently showing — snapshotted on commit
  let ghostPlaceable = false; // is the ghost on a legal mount (a top face)?
  const placed: Placed[] = [];

  const steering = new Map<VoxelHit["visual"], number>(); // per body: the held pod-yaw angle (rad)
  const heldKeys = new Set<string>();
  let controlledHelm: Placed | null = null; // the helm the sailor is currently steering, or null

  // Debug overlay: a wireframe box on each grid cell a fixture occupies (see occupiedCells), so the
  // T-shaped helm footprint / the engine's outboard cell are visible. Toggled from the scene Debug GUI.
  const occSource = new THREE.BoxGeometry(VOXEL, VOXEL, VOXEL);
  const occGeometry = new THREE.EdgesGeometry(occSource);
  const occMaterial = new THREE.LineBasicMaterial({
    color: 0x59e0ff,
    transparent: true,
    opacity: 0.9,
    depthTest: false,
  });
  const occGroup = new THREE.Group();
  occGroup.visible = false;
  root.add(occGroup);
  const occBoxes: THREE.LineSegments[] = [];
  let occDebug = false;

  const occBox = (i: number): THREE.LineSegments => {
    while (occBoxes.length <= i) {
      const box = new THREE.LineSegments(occGeometry, occMaterial);
      box.renderOrder = 998;
      box.frustumCulled = false;
      box.layers.set(MAIN_PASS_LAYER); // draw over the water, stay out of the scene capture
      box.visible = false;
      occGroup.add(box);
      occBoxes.push(box);
    }
    return occBoxes[i];
  };

  // Would a voxel centred at `p` (world) overlap the sailor's capsule? Distance from the point to the
  // vertical capsule segment vs the capsule radius plus the voxel's half-extent.
  const wouldHitPlayer = (p: THREE.Vector3): boolean => {
    const bodyCenterY = camera.position.y - PLAYER_EYE_FROM_CENTER;
    const dxz = Math.hypot(p.x - camera.position.x, p.z - camera.position.z);
    const clampedY = THREE.MathUtils.clamp(
      p.y,
      bodyCenterY - PLAYER_CYLINDER_HALF,
      bodyCenterY + PLAYER_CYLINDER_HALF,
    );
    const dist = Math.hypot(dxz, p.y - clampedY);
    return dist < PLAYER_RADIUS + VOXEL_HALF;
  };

  // The aimed face's outward grid normal (placeCell − cell). We only mount a fixture on a TOP face — a
  // deck cell — so the sailor points down at where it sits, matching how a helm/engine is fitted.
  const facesUp = (hit: VoxelHit): boolean =>
    hit.placeCell[0] === hit.cell[0] &&
    hit.placeCell[2] === hit.cell[2] &&
    hit.placeCell[1] - hit.cell[1] === 1;

  // Pick the ship cardinal whose world direction (heel included) best matches the player's flat look.
  const cardinalFromLook = (bodyQuat: THREE.Quaternion): number => {
    lookFlat.copy(forward);
    lookFlat.y = 0;
    lookFlat.normalize();
    let best = 0;
    let bestDot = -Infinity;
    for (let i = 0; i < LOCAL_CARDINALS.length; i++) {
      scratchDir.copy(LOCAL_CARDINALS[i].dir).applyQuaternion(bodyQuat);
      scratchDir.y = 0;
      const dot = scratchDir.normalize().dot(lookFlat);
      if (dot > bestDot) {
        bestDot = dot;
        best = i;
      }
    }
    return best;
  };

  // Place `object` (child of a cell-posed anchor) in its mount pose: a helm stands on the cell TOP; an
  // engine clamps to the CENTRE of the outboard face (the chosen cardinal), both facing that cardinal.
  const applyMountPose = (object: THREE.Object3D, kind: FixtureKind, cardinal: number): void => {
    const { yaw, dir } = LOCAL_CARDINALS[cardinal];
    object.rotation.set(0, yaw, 0);
    if (kind === "helm") object.position.set(0, VOXEL_HALF, 0);
    else object.position.set(dir.x * VOXEL_HALF, 0, dir.z * VOXEL_HALF);
  };

  // The grid cells a mounted fixture fills, so building into them is refused. A helm is a T standing on
  // its mount: the pedestal column rises one cell, then the ~0.8 m wheel fills the two cells above at its
  // full width — its centre plus the cell to either side (perpendicular to facing). An engine hangs off
  // the outboard face and drops through the cells below it, down to the pod + propeller.
  const occupiedCells = (
    kind: FixtureKind,
    [cx, cy, cz]: [number, number, number],
    cardinal: number,
  ): [number, number, number][] => {
    const { dir } = LOCAL_CARDINALS[cardinal];
    if (kind === "helm") {
      const px = dir.z; // a ±90° step off `dir` — the horizontal axis the wheel spreads along
      const pz = -dir.x;
      return [
        [cx, cy + 1, cz], // pedestal column
        [cx, cy + 2, cz], // the wheel, at full width across two cells of height
        [cx + px, cy + 2, cz + pz],
        [cx - px, cy + 2, cz - pz],
        [cx, cy + 3, cz],
        [cx + px, cy + 3, cz + pz],
        [cx - px, cy + 3, cz - pz],
      ];
    }
    return [
      [cx + dir.x, cy, cz + dir.z], // clamp + powerhead on the outboard face
      [cx + dir.x, cy - 1, cz + dir.z], // shaft
      [cx + dir.x, cy - 2, cz + dir.z], // pod + propeller
    ];
  };

  // A build cell is free for a fixture footprint if no hull voxel and no other fixture already fills it.
  const cellFree = (visual: VoxelHit["visual"], cell: [number, number, number]): boolean =>
    !physics.hasVoxel(visual, cell) &&
    !placed.some(
      (p) =>
        p.visual === visual &&
        p.occupied.some((c) => c[0] === cell[0] && c[1] === cell[1] && c[2] === cell[2]),
    );

  // A fixture is placeable only if aimed at a top face AND its whole footprint is free — so an engine
  // whose look-chosen facing would drive it into the hull (or off no exposed edge) is refused.
  const fixtureFits = (kind: FixtureKind, hit: VoxelHit, cardinal: number): boolean =>
    facesUp(hit) && occupiedCells(kind, hit.cell, cardinal).every((c) => cellFree(hit.visual, c));

  const placeBlockedByFixture = (hit: VoxelHit): boolean =>
    placed.some(
      (p) =>
        p.visual === hit.visual &&
        p.occupied.some(
          (c) => c[0] === hit.placeCell[0] && c[1] === hit.placeCell[1] && c[2] === hit.placeCell[2],
        ),
    );

  const makeGhost = (kind: FixtureKind): Ghost => {
    const fixture = createFixture(kind);
    // One translucent material for the whole silhouette — the ghost is a preview, not the real object,
    // so it reads as a white(placeable)/grey(blocked) hologram rather than its finished materials.
    const material = new THREE.MeshBasicMaterial({
      color: AIM_COLOR_PLACEABLE,
      transparent: true,
      opacity: GHOST_OPACITY_PLACEABLE,
      depthWrite: false,
    });
    fixture.object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.material = material;
        child.renderOrder = 999;
        child.layers.set(MAIN_PASS_LAYER); // HUD-like: draw over the water, stay out of the scene capture
      }
    });
    const anchor = new THREE.Group();
    anchor.add(fixture.object);
    anchor.visible = false;
    return {
      kind,
      fixture,
      anchor,
      material,
      setPlaceable: (ok) => {
        material.color.setHex(ok ? AIM_COLOR_PLACEABLE : AIM_COLOR_BLOCKED);
        material.opacity = ok ? GHOST_OPACITY_PLACEABLE : GHOST_OPACITY_BLOCKED;
      },
    };
  };

  const disposeGhost = (): void => {
    if (!ghost) return;
    root.remove(ghost.anchor);
    ghost.fixture.dispose();
    ghost.material.dispose();
    ghost = null;
  };

  // Toggle a fixture mode: pressing its key again (or a different one) exits / switches; Esc always exits.
  const setMode = (next: Mode): void => {
    if (next === mode) next = "voxel";
    disposeGhost();
    if (next !== "voxel") {
      ghost = makeGhost(next);
      root.add(ghost.anchor);
    }
    mode = next;
  };

  const placeFixture = (
    kind: FixtureKind,
    visual: VoxelHit["visual"],
    cell: [number, number, number],
    cardinal: number,
  ): void => {
    const fixture = createFixture(kind);
    const anchor = new THREE.Group();
    anchor.add(fixture.object);
    applyMountPose(fixture.object, kind, cardinal);
    physics.poseVoxel(anchor, visual, cell);
    root.add(anchor);
    placed.push({ visual, cell, anchor, fixture, occupied: occupiedCells(kind, cell, cardinal) });
  };

  const commitFixture = (): void => {
    if (!ghost || !currentHit || !ghostPlaceable) return;
    placeFixture(ghost.kind, currentHit.visual, currentHit.cell, ghostCardinal);
  };

  // Remove a committed fixture the sailor is aiming at, if it's nearer than `maxDist` (so you can't
  // delete one through the deck). Returns true if one was removed.
  const removeAimedFixture = (maxDist: number): boolean => {
    if (placed.length === 0) return false;
    raycaster.set(camera.position, forward);
    raycaster.far = Math.min(REACH, maxDist);
    const hits = raycaster.intersectObjects(
      placed.map((p) => p.fixture.object),
      true,
    );
    if (hits.length === 0) return false;
    const hitObject = hits[0].object;
    const idx = placed.findIndex((p) => {
      for (let o: THREE.Object3D | null = hitObject; o; o = o.parent) if (o === p.fixture.object) return true;
      return false;
    });
    if (idx === -1) return false;
    const [entry] = placed.splice(idx, 1);
    if (entry === highlightedHelm) highlightedHelm = null; // it's about to be disposed
    root.remove(entry.anchor);
    entry.fixture.dispose();
    return true;
  };

  // Diegetic "you can take this wheel" cue: the helm the sailor is aiming at glows warm. No HUD prompt —
  // the object itself lights up under your gaze, the same way the aim dot signals a buildable face.
  let highlightedHelm: Placed | null = null;
  const setHelmEmissive = (p: Placed, hex: number): void => {
    p.fixture.object.traverse((o) => {
      if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) {
        o.material.emissive.setHex(hex);
      }
    });
  };
  const highlightHelm = (p: Placed | null): void => {
    if (p === highlightedHelm) return;
    if (highlightedHelm) setHelmEmissive(highlightedHelm, 0x000000);
    highlightedHelm = p;
    if (p) setHelmEmissive(p, HELM_HIGHLIGHT);
  };

  // The committed helm the sailor can take the wheel of: the one they're close enough to AND looking
  // toward. Distance + facing, NOT a precise mesh hit — aiming at the wheel's open centre still counts.
  const aimedHelm = (): Placed | null => {
    let best: Placed | null = null;
    let bestFacing = HELM_REACH_COS;
    for (const p of placed) {
      const wheel = p.fixture.wheel;
      if (!wheel) continue; // helms only (an engine has no wheel)
      wheel.getWorldPosition(helmPos);
      toHelm.copy(helmPos).sub(camera.position);
      const dist = toHelm.length();
      if (dist > HELM_REACH || dist < 1e-4) continue;
      const facing = toHelm.dot(forward) / dist; // cos(angle between look dir and dir-to-wheel)
      if (facing > bestFacing) {
        bestFacing = facing;
        best = p;
      }
    }
    return best;
  };

  const onMouseDown = (e: MouseEvent) => {
    if (!isActive() || controlledHelm) return; // holding the wheel — no build clicks
    if (mode !== "voxel") {
      if (e.button === 2) commitFixture(); // right-click places, the same button as placing a voxel
      else if (e.button === 0) {
        // Left-click still removes a fixture you're aiming at, even while placing another.
        const voxelDist = currentHit ? camera.position.distanceTo(currentHit.point) : Infinity;
        removeAimedFixture(voxelDist);
      }
      return;
    }
    if (e.button === 0) {
      // Left-click removes: a fixture if you're aiming at one nearer than the voxel, else the voxel.
      const voxelDist = currentHit ? camera.position.distanceTo(currentHit.point) : Infinity;
      if (removeAimedFixture(voxelDist)) {
        currentHit = null;
      } else if (currentHit) {
        physics.removeVoxel(currentHit);
        currentHit = null; // its cell may be gone; re-aim next frame
      }
    } else if (e.button === 2 && currentHit && canPlace) {
      physics.placeVoxel(currentHit);
      currentHit = null;
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!isActive()) return;
    heldKeys.add(e.code);
    if (e.code === "KeyE") {
      // Take / release the helm the sailor is aiming at (taking it leaves any placement mode).
      if (controlledHelm) controlledHelm = null;
      else {
        camera.getWorldDirection(forward);
        const helm = aimedHelm();
        if (helm) {
          setMode("voxel");
          controlledHelm = helm;
        }
      }
      return;
    }
    if (controlledHelm) return; // holding the wheel — build keys are suspended
    if (e.code === "Digit1") setMode("helm");
    else if (e.code === "Digit2") setMode("engine");
    else if (e.code === "KeyQ" && mode === "voxel") {
      camera.getWorldDirection(forward);
      physics.dropVoxel(camera.position, forward, playerVelocity());
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    heldKeys.delete(e.code);
  };

  // Right-click is the place button (voxel and fixture), so suppress the browser context menu.
  const onContextMenu = (e: Event) => e.preventDefault();

  window.addEventListener("mousedown", onMouseDown);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  domElement.addEventListener("contextmenu", onContextMenu);

  const updateAimDot = (): void => {
    camera.getWorldDirection(forward);
    currentHit = physics.raycastVoxel(camera.position, forward, REACH);
    if (currentHit) {
      aimDot.position.copy(currentHit.point); // the physical crosshair, on the aimed surface
      aimDot.visible = true;
      physics.poseVoxel(probe, currentHit.visual, currentHit.placeCell);
      canPlace = !wouldHitPlayer(probe.position) && !placeBlockedByFixture(currentHit);
      aimMaterial.color.setHex(canPlace ? AIM_COLOR_PLACEABLE : AIM_COLOR_BLOCKED);
      aimMaterial.opacity = canPlace ? AIM_OPACITY_PLACEABLE : AIM_OPACITY_BLOCKED;
    } else {
      aimDot.visible = false; // nothing buildable under the crosshair (e.g. open sea)
      canPlace = false;
    }
  };

  const updateGhost = (): void => {
    if (!ghost) return;
    camera.getWorldDirection(forward);
    currentHit = physics.raycastVoxel(camera.position, forward, REACH);
    if (!currentHit) {
      ghost.anchor.visible = false;
      ghostPlaceable = false;
      return;
    }
    physics.poseVoxel(ghost.anchor, currentHit.visual, currentHit.cell);
    ghostCardinal = cardinalFromLook(ghost.anchor.quaternion);
    applyMountPose(ghost.fixture.object, ghost.kind, ghostCardinal);
    ghostPlaceable = fixtureFits(ghost.kind, currentHit, ghostCardinal);
    ghost.anchor.visible = true;
    ghost.setPlaceable(ghostPlaceable);
  };

  const updateOccupancyDebug = (): void => {
    if (!occDebug) {
      occGroup.visible = false;
      return;
    }
    occGroup.visible = true;
    let i = 0;
    const show = (visual: VoxelHit["visual"], cell: [number, number, number]): void => {
      physics.poseVoxel(occBox(i), visual, cell);
      occBoxes[i].visible = true;
      i++;
    };
    for (const p of placed) for (const c of p.occupied) show(p.visual, c);
    if (ghost && currentHit) {
      // Preview the footprint under the ghost even when blocked, so an overlap is visible.
      for (const c of occupiedCells(ghost.kind, currentHit.cell, ghostCardinal)) show(currentHit.visual, c);
    }
    for (; i < occBoxes.length; i++) occBoxes[i].visible = false;
  };

  return {
    object: root,
    update: (dt: number) => {
      if (controlledHelm && !isActive()) controlledHelm = null; // dropped control on leaving first person
      if (!isActive()) heldKeys.clear();

      // At the helm: A/D move the held steering angle (no auto-centre — it stays where you leave it).
      if (controlledHelm) {
        const v = controlledHelm.visual;
        let s = steering.get(v) ?? 0;
        if (heldKeys.has("KeyA")) s -= STEER_RATE * dt;
        if (heldKeys.has("KeyD")) s += STEER_RATE * dt;
        steering.set(v, THREE.MathUtils.clamp(s, -MAX_STEER, MAX_STEER));
      }

      // Committed fixtures ride the hull and show their steering: a helm spins its wheel, an engine yaws
      // its pod. Every fixture on one body reads the SAME angle, so multiple helms/engines stay in sync.
      for (const p of placed) {
        physics.poseVoxel(p.anchor, p.visual, p.cell);
        const s = steering.get(p.visual) ?? 0;
        if (p.fixture.wheel) p.fixture.wheel.rotation.z = s * WHEEL_TURN_RATIO;
        if (p.fixture.steer) p.fixture.steer.rotation.y = s;
      }

      if (!isActive() || controlledHelm) {
        aimDot.visible = false;
        if (ghost) ghost.anchor.visible = false;
        currentHit = null;
        canPlace = false;
        highlightHelm(null);
      } else if (mode === "voxel") {
        if (ghost) ghost.anchor.visible = false;
        updateAimDot();
        highlightHelm(aimedHelm()); // glow the helm under the crosshair (updateAimDot set `forward`)
      } else {
        aimDot.visible = false;
        updateGhost();
        highlightHelm(null);
      }
      updateOccupancyDebug();
    },
    isSteering: () => controlledHelm !== null,
    placeFixture,
    setOccupancyDebug: (on: boolean) => {
      occDebug = on;
    },
    dispose: () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      domElement.removeEventListener("contextmenu", onContextMenu);
      disposeGhost();
      for (const p of placed) p.fixture.dispose();
      aimGeometry.dispose();
      aimMaterial.dispose();
      occSource.dispose();
      occGeometry.dispose();
      occMaterial.dispose();
    },
  };
}
