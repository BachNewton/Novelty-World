import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";

/**
 * The first-person sailor. A DYNAMIC capsule rigid body (real ~85 kg) — NOT a kinematic character
 * controller. rapier3d-compat's KinematicCharacterController only works with a plain solid collider,
 * which as an infinite-mass kinematic body shoves/capsizes the light dynamic raft; and any attempt
 * to stop that (sensor / collision- or solver-groups) breaks the controller's ground query. A finite-
 * mass dynamic body sidesteps all of it and is physically honest:
 *
 *  - VERTICAL axis is left entirely to the solver: gravity pulls him down, the deck's contact normal
 *    force holds him up. That force IS the weight transfer, at his real contact point — so standing
 *    near an edge keels the raft, jumping bobs it, landing thumps it, and 85 kg can't capsize a
 *    5,600 kg raft. All emergent and correct; no bespoke foot-force.
 *  - HORIZONTAL axis is velocity-steered for crisp FPS control: each fixed step we set his horizontal
 *    velocity to the raft's velocity at his feet PLUS his WASD input. So idle → he's locked to the
 *    deck's frame and rides the swell; input → he moves relative to the deck. Diagonals normalised,
 *    frame-rate independent (velocity, stepped in the sim's fixed loop). Because we impose that
 *    velocity, we also apply its equal-and-opposite impulse back into the raft at the feet — a
 *    momentum-conserving foot reaction, so a sailor walking/wiggling can't inject momentum from
 *    nowhere and creep the whole raft. Deck friction is therefore ZERO: the horizontal coupling is
 *    entirely this explicit reaction, not the solver's friction (which would double-count and creep).
 *  - Rotation is LOCKED (upright); mouse-look lives on the camera. CCD stops the spawn-drop punching
 *    through the thin deck.
 *
 * Riding waves as the deck heaves, and losing footing in rough seas, extend naturally from this
 * (contact + friction ride him; a future slip threshold on the grip breaks footing when it's rough).
 */

// Metric, matching the rest of Shipwright.
const HEIGHT = 1.8;
const RADIUS = 0.3;
const CYLINDER_HALF = (HEIGHT - 2 * RADIUS) / 2; // 0.6 — Rapier capsule half-height (cylinder part)
const EYE_FROM_CENTER = HEIGHT / 2 - 0.1; // 0.8 — eye ~0.1 m below the crown, from the body centre
const MASS = 85; // kg — average Nordic male; the weight the raft feels underfoot
const SPEED = 4; // m/s — a brisk walk (relative to the deck)
const JUMP_SPEED = 4.2; // m/s launch → ~0.9 m hop
// Mid-air steering. Real physics gives zero air control, but this is a game and you may need to
// adjust a jump to land back on the deck, so we're generous — Minecraft-style: much weaker than the
// (instant) ground control but momentum-preserving. Accelerate toward input up to walk speed only.
const AIR_ACCEL = 12; // m/s²
const MOUSE_SENSITIVITY = 0.0022; // radians per pixel of mouse movement
const PITCH_LIMIT = Math.PI / 2 - 0.05; // can't look quite straight up/down (avoids gimbal flip)
const GROUND_RAY = CYLINDER_HALF + RADIUS + 0.15; // centre → just past the feet; a hit ⇒ grounded
const SPAWN = new THREE.Vector3(0, 1.4, 0); // above the raft deck; falls onto it (CCD-safe)

const UP = new THREE.Vector3(0, 1, 0);

export interface Player {
  /** The visual capsule (shown in orbit/debug view, hidden in first-person). Add to the scene. */
  object: THREE.Object3D;
  /** Create the dynamic body + collider in the world (after Rapier init). */
  attach: (world: RAPIER.World) => void;
  /** Steer movement inside the sim's fixed loop (dt = the fixed timestep). No-op until attached. */
  fixedStep: (dt: number) => void;
  /** Snapshot the sailor's post-step position for render interpolation. Call just after each
   *  world.step() (via physics.onAfterStep), in lock-step with the raft's snapshot. */
  recordStep: () => void;
  /** Pose the sailor at the render-interpolated position (see physics `alpha`): moves the visual
   *  capsule always, and drives the eye camera + mouse-look while in first person. Call per render
   *  frame with the sim's interpolation factor. */
  syncCamera: (alpha: number) => void;
  /** Whether first-person control is engaged (pointer locked). */
  isActive: () => boolean;
  /** The capsule collider once attached (null before). The voxel builder excludes it from its aim ray
   *  so the eye — which sits inside the capsule — doesn't self-hit. */
  collider: () => RAPIER.Collider | null;
  /** The sailor's current world velocity (zero before attach). A dropped voxel inherits it so it keeps
   *  the player's momentum instead of lurching when you drop while walking or riding a swell. */
  velocity: () => THREE.Vector3;
  dispose: () => void;
}

export function createPlayer(
  camera: THREE.PerspectiveCamera,
  domElement: HTMLElement,
  opts: { onActiveChange?: (active: boolean) => void } = {},
): Player {
  // Visual capsule — seen from the orbit/debug camera; hidden in first-person so it doesn't wrap the
  // eye. CapsuleGeometry(radius, cylinderLength, ...) → total height = length + 2·radius.
  const geometry = new THREE.CapsuleGeometry(RADIUS, CYLINDER_HALF * 2, 8, 16);
  const material = new THREE.MeshStandardMaterial({ color: 0xd9c8a8, roughness: 0.85 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(SPAWN);

  let world: RAPIER.World | null = null;
  let body: RAPIER.RigidBody | null = null;
  let collider: RAPIER.Collider | null = null;

  let yaw = Math.PI; // face -Z to start (across the water, matching the scene's framing)
  let pitch = 0;
  let active = false;
  let jumpQueued = false; // one-shot: set on Space keydown, consumed when grounded

  const keys = new Set<string>();
  const onKeyDown = (e: KeyboardEvent) => {
    keys.add(e.code);
    // Camera toggle: ` (backtick) flips first-person ↔ orbit; F also enters; Esc releases the lock.
    // Keys, not a click, so they don't fight OrbitControls' click-drag. requestPointerLock needs a
    // user gesture (a keydown is one); exitPointerLock doesn't.
    if (e.code === "Backquote") {
      if (active) document.exitPointerLock();
      else domElement.requestPointerLock();
    } else if (e.code === "KeyF" && !active) {
      domElement.requestPointerLock();
    } else if (e.code === "Space" && active) {
      jumpQueued = true;
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    keys.delete(e.code);
  };
  const onMouseMove = (e: MouseEvent) => {
    if (!active) return;
    yaw -= e.movementX * MOUSE_SENSITIVITY;
    pitch -= e.movementY * MOUSE_SENSITIVITY;
    pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch));
  };
  const onPointerLockChange = () => {
    active = document.pointerLockElement === domElement;
    mesh.visible = !active; // don't render our own capsule around the eye
    if (!active) {
      keys.clear(); // release control cleanly — no key stuck down
      jumpQueued = false;
    }
    opts.onActiveChange?.(active);
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("pointerlockchange", onPointerLockChange);

  const dir = new THREE.Vector3(); // reused world-space unit move direction from WASD + yaw
  const euler = new THREE.Euler(0, 0, 0, "YXZ");
  // Render interpolation: the sailor's body position at the last two fixed steps, lerped by the
  // sim's `alpha` each render frame so the eye moves smoothly at the render rate (rotation is
  // locked upright, so position is all we need). `interpPos` is the reused per-frame result.
  const prevBodyPos = SPAWN.clone();
  const currBodyPos = SPAWN.clone();
  const interpPos = new THREE.Vector3();
  // Reused downward ray to find the (dynamic) body underfoot — for grounding + its velocity.
  const downRay = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });

  return {
    object: mesh,
    attach: (w) => {
      world = w;
      body = w.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(SPAWN.x, SPAWN.y, SPAWN.z)
          .lockRotations() // stays upright; mouse-look is camera-only
          .setCcdEnabled(true) // don't tunnel through the thin deck on the spawn drop
          .setLinearDamping(0), // horizontal is steered explicitly; keep jump arcs clean
      );
      collider = w.createCollider(
        RAPIER.ColliderDesc.capsule(CYLINDER_HALF, RADIUS)
          .setMass(MASS) // real weight the raft feels — the capsule volume alone would be too light
          // ZERO friction on purpose: horizontal grip/ride is the explicit velocity-lock +
          // momentum-conserving reaction in fixedStep, not the solver. Non-zero friction would add
          // a SECOND, uncontrolled coupling — it drags the light raft toward the sailor's slide each
          // step (which we then erase on the sailor by re-setting his velocity), so the raft creeps.
          // Vertical weight transfer / tipping is normal-force, independent of friction, so it stays.
          .setFriction(0)
          .setRestitution(0),
        body,
      );
    },
    fixedStep: (dt) => {
      if (!world || !body || !collider) return;
      const t = body.translation();
      const lin = body.linvel();

      // Ground check + find the body underfoot (its velocity is the platform we ride).
      downRay.origin.x = t.x;
      downRay.origin.y = t.y;
      downRay.origin.z = t.z;
      const hit = world.castRay(downRay, GROUND_RAY, true, undefined, undefined, collider);
      const support = hit?.collider.parent();
      const grounded = hit !== null;

      // World-space unit move direction from WASD + look yaw (shared by ground + air control).
      dir.set(0, 0, 0);
      if (active) {
        if (keys.has("KeyW")) dir.z -= 1;
        if (keys.has("KeyS")) dir.z += 1;
        if (keys.has("KeyA")) dir.x -= 1;
        if (keys.has("KeyD")) dir.x += 1;
      }
      const hasInput = dir.lengthSq() > 0;
      if (hasInput) dir.normalize().applyAxisAngle(UP, yaw); // normalised → no faster diagonals

      const footY = t.y - CYLINDER_HALF - RADIUS;

      if (grounded) {
        // The body underfoot, if it's a dynamic one we can ride + react against (null for static
        // ground). Narrowed here so the ?. optional-chain result is a plain non-null reference.
        const dynamicSupport = support?.isDynamic() === true ? support : null;
        // Velocity of the deck at the sailor's feet (rigid-body point velocity: v + ω × r), so idle
        // he moves WITH the raft. Zero for a static ground.
        let px = 0;
        let pz = 0;
        if (dynamicSupport) {
          const pv = dynamicSupport.linvel();
          const av = dynamicSupport.angvel();
          const com = dynamicSupport.worldCom();
          const rx = t.x - com.x;
          const ry = footY - com.y;
          const rz = t.z - com.z;
          px = pv.x + (av.y * rz - av.z * ry);
          pz = pv.z + (av.x * ry - av.y * rx);
        }

        // Input velocity relative to the deck.
        let ivx = dir.x * SPEED;
        let ivz = dir.z * SPEED;
        // Slide along walls rather than pushing through them. A single forward ray misses a CORNER
        // (it shoots the gap between the two perpendicular walls), so instead query EVERY contact on
        // the capsule and project the input out of each near-horizontal (wall) contact normal. At a
        // corner that's two normals → the diagonal input is projected to ~zero and he simply stops,
        // without the solver having to resolve a wall penetration by shoving the light raft. Vertical
        // (deck/ground) contacts are skipped — those hold him up, they're not walls to slide on.
        if (hasInput) {
          // Stable non-null aliases: the closures below capture these, and TS widens the
          // outer mutable `world`/`collider` back to nullable inside a deferred callback.
          const w = world;
          const col = collider;
          const center = support ? support.translation() : null; // raft origin ≈ centroid
          w.contactPairsWith(col, (other) => {
            w.contactPair(col, other, (manifold) => {
              if (manifold.numContacts() === 0) return;
              const n = manifold.normal();
              const horiz = Math.hypot(n.x, n.z);
              if (Math.abs(n.y) > 0.5 || horiz < 1e-4) return; // deck/ground, not a wall
              let nx = n.x / horiz;
              let nz = n.z / horiz;
              // The contact normal's sign is ambiguous; orient it to point from the wall toward the
              // sailor (inward, toward the raft centre) so "into the wall" (dot < 0) is unambiguous.
              if (center) {
                if ((center.x - t.x) * nx + (center.z - t.z) * nz < 0) {
                  nx = -nx;
                  nz = -nz;
                }
              }
              const into = ivx * nx + ivz * nz; // < 0 ⇒ heading into the wall
              if (into < 0) {
                ivx -= into * nx;
                ivz -= into * nz;
              }
            });
          });
        }

        // Steer only the horizontal velocity; leave the vertical to the solver (weight/heave/land).
        const vx = px + ivx;
        const vz = pz + ivz;
        body.setLinvel({ x: vx, y: lin.y, z: vz }, true);

        // Momentum-conserving foot reaction. Imposing that horizontal velocity is really the sailor's
        // feet pushing on the deck — walking forward pushes the deck back, a heaving deck carrying him
        // loads it, etc. — so apply the opposite of the horizontal impulse we just gave him back into
        // the raft at the foot point. Without this the steering injects momentum from nowhere and a
        // sailor jittering on a corner slowly rotates/creeps the whole raft; with it, the (sailor +
        // raft) horizontal momentum is conserved, so walk-and-return leaves the raft where it was.
        if (dynamicSupport) {
          const jx = -MASS * (vx - lin.x);
          const jz = -MASS * (vz - lin.z);
          dynamicSupport.applyImpulseAtPoint(
            { x: jx, y: 0, z: jz },
            { x: t.x, y: footY, z: t.z },
            true,
          );
        }

        // Jump = launch impulse up on the sailor + its Newton's-3rd-law reaction down into the deck.
        if (jumpQueued) {
          jumpQueued = false;
          body.applyImpulse({ x: 0, y: MASS * JUMP_SPEED, z: 0 }, true);
          if (dynamicSupport) {
            dynamicSupport.applyImpulseAtPoint(
              { x: 0, y: -MASS * JUMP_SPEED, z: 0 },
              { x: t.x, y: footY, z: t.z },
              true,
            );
          }
        }
      } else if (hasInput) {
        // Airborne: preserve momentum, but allow limited steering — accelerate toward the input up
        // to walk speed only (so you can't gain speed in the air, just redirect a bit).
        const along = lin.x * dir.x + lin.z * dir.z;
        if (along < SPEED) {
          const add = Math.min(AIR_ACCEL * dt, SPEED - along);
          body.setLinvel({ x: lin.x + dir.x * add, y: lin.y, z: lin.z + dir.z * add }, true);
        }
      }
      // The mesh/eye are posed in syncCamera from the interpolated position, not here — posing at
      // the raw step rate is exactly the jitter we're avoiding.
    },
    recordStep: () => {
      if (!body) return;
      const t = body.translation();
      prevBodyPos.copy(currBodyPos);
      currBodyPos.set(t.x, t.y, t.z);
    },
    syncCamera: (alpha) => {
      if (!body) return;
      interpPos.lerpVectors(prevBodyPos, currBodyPos, alpha);
      mesh.position.copy(interpPos); // debug capsule (hidden in first person; smooth in orbit view)
      if (!active) return; // orbit controls own the camera; the sailor mesh is already interpolated
      camera.position.set(interpPos.x, interpPos.y + EYE_FROM_CENTER, interpPos.z);
      euler.set(pitch, yaw, 0);
      camera.quaternion.setFromEuler(euler);
    },
    isActive: () => active,
    collider: () => collider,
    velocity: () => {
      if (!body) return new THREE.Vector3();
      const lv = body.linvel();
      return new THREE.Vector3(lv.x, lv.y, lv.z);
    },
    dispose: () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("pointerlockchange", onPointerLockChange);
      geometry.dispose();
      material.dispose();
      // The body/collider live in the Rapier world and are freed with it (physics.dispose).
    },
  };
}
