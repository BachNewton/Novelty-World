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
 *    frame-rate independent (velocity, stepped in the sim's fixed loop).
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
  /** Place the camera at eye level + apply mouse-look. Call per render frame while active. */
  syncCamera: () => void;
  /** Whether first-person control is engaged (pointer locked). */
  isActive: () => boolean;
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
  // Reused downward ray to find the (dynamic) body underfoot — for grounding + its velocity.
  const downRay = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  // Reused horizontal ray to detect a wall in the move direction, so we don't steer INTO it (which
  // would push the raft — an internal force that shouldn't move the whole boat).
  const wallRay = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });

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
          .setFriction(1) // grip the deck (rides it; the future rough-sea slip loosens this)
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
        // Velocity of the deck at the sailor's feet (rigid-body point velocity: v + ω × r), so idle
        // he moves WITH the raft. Zero for a static ground.
        let px = 0;
        let pz = 0;
        if (support?.isDynamic() === true) {
          const pv = support.linvel();
          const av = support.angvel();
          const com = support.worldCom();
          const rx = t.x - com.x;
          const ry = footY - com.y;
          const rz = t.z - com.z;
          px = pv.x + (av.y * rz - av.z * ry);
          pz = pv.z + (av.x * ry - av.y * rx);
        }

        // Input velocity relative to the deck. If it drives into a wall, project it along the wall
        // instead of pushing through — otherwise steering into the raft's own wall shoves the boat.
        let ivx = dir.x * SPEED;
        let ivz = dir.z * SPEED;
        if (hasInput) {
          wallRay.origin.x = t.x;
          wallRay.origin.y = footY + 0.25; // ~mid-height of the 0.5 m wall
          wallRay.origin.z = t.z;
          wallRay.dir.x = dir.x;
          wallRay.dir.y = 0;
          wallRay.dir.z = dir.z;
          const wall = world.castRayAndGetNormal(
            wallRay,
            RADIUS + 0.15,
            true,
            undefined,
            undefined,
            collider,
          );
          if (wall) {
            const n = wall.normal;
            const into = ivx * n.x + ivz * n.z; // <0 ⇒ heading into the wall
            if (into < 0) {
              ivx -= into * n.x;
              ivz -= into * n.z;
            }
          }
        }

        // Steer only the horizontal velocity; leave the vertical to the solver (weight/heave/land).
        body.setLinvel({ x: px + ivx, y: lin.y, z: pz + ivz }, true);

        // Jump = launch impulse up on the sailor + its Newton's-3rd-law reaction down into the deck.
        if (jumpQueued) {
          jumpQueued = false;
          body.applyImpulse({ x: 0, y: MASS * JUMP_SPEED, z: 0 }, true);
          if (support?.isDynamic() === true) {
            support.applyImpulseAtPoint(
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

      mesh.position.set(t.x, t.y, t.z); // body rotation is locked, so the mesh stays upright
    },
    syncCamera: () => {
      if (!body) return;
      const t = body.translation();
      camera.position.set(t.x, t.y + EYE_FROM_CENTER, t.z);
      euler.set(pitch, yaw, 0);
      camera.quaternion.setFromEuler(euler);
    },
    isActive: () => active,
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
