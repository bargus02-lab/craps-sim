// Headless pre-roll solver. Given a target face pair (drawn from crypto RNG
// BEFORE any physics runs), search randomized launch parameters until a
// simulated throw settles cleanly on exactly that combination, then return the
// recorded trajectory for visual replay.
//
// Because the target is drawn first and the search merely finds a trajectory
// that displays it, outcomes are exactly as uniform as the crypto draw —
// physics never decides the roll, only how it looks.
//
// Pure cannon-es + math: no DOM, no Three.js. Runs in a Web Worker in the app
// and directly under Node in the test suite.

import * as CANNON from 'cannon-es';
import type { Die } from '../engine/state';
import { mulberry32 } from '../engine/rng';
import { topFaceFromQuat } from './faces';
import { DICE, SOLVER, TABLE } from '../scene/constants';

export interface SolveResult {
  /** frameCount * 14 floats per frame: dieA(px,py,pz,qx,qy,qz,qw), dieB(same). */
  frames: Float32Array;
  frameCount: number;
  /** Seconds per frame. */
  dt: number;
  /** Total attempts across all batches (for the fairness panel). */
  attempts: number;
  seed: number;
  /** Always equals the requested target, in target order. */
  faces: [Die, Die];
}

const FLOATS_PER_FRAME = 14;
const MAX_STEPS = Math.round(SOLVER.maxSimSeconds / SOLVER.dt);
/** Extra still frames kept after settling so the replay visibly comes to rest. */
const TAIL_FRAMES = 30;

interface PhysicsRig {
  world: CANNON.World;
  dice: [CANNON.Body, CANNON.Body];
}

/** A die has "hit the far wall" once its center gets within contact range of the inner face. */
const WALL_CONTACT_X = -(TABLE.feltHalfX - 0.003) + DICE.half;

function buildRig(): PhysicsRig {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  (world.solver as CANNON.GSSolver).iterations = 20;

  const dieMat = new CANNON.Material('die');
  const feltMat = new CANNON.Material('felt');
  const wallMat = new CANNON.Material('wall');
  world.addContactMaterial(
    new CANNON.ContactMaterial(dieMat, feltMat, { friction: 0.34, restitution: 0.25 }),
  );
  world.addContactMaterial(
    new CANNON.ContactMaterial(dieMat, wallMat, { friction: 0.12, restitution: 0.5 }),
  );
  world.addContactMaterial(
    new CANNON.ContactMaterial(dieMat, dieMat, { friction: 0.15, restitution: 0.45 }),
  );

  const { feltHalfX, feltHalfZ, wallHeight, wallThickness: wt } = TABLE;

  const felt = new CANNON.Body({ type: CANNON.Body.STATIC, material: feltMat });
  felt.addShape(new CANNON.Box(new CANNON.Vec3(feltHalfX + 0.3, 0.05, feltHalfZ + 0.3)));
  felt.position.set(0, -0.05, 0);
  world.addBody(felt);

  const mkWall = (hx: number, hz: number, x: number, z: number) => {
    const wall = new CANNON.Body({ type: CANNON.Body.STATIC, material: wallMat });
    wall.addShape(new CANNON.Box(new CANNON.Vec3(hx, wallHeight / 2, hz)));
    wall.position.set(x, wallHeight / 2, z);
    world.addBody(wall);
    return wall;
  };
  mkWall(wt / 2, feltHalfZ + wt, -(feltHalfX + wt / 2), 0); // far wall (-X end)
  mkWall(wt / 2, feltHalfZ + wt, feltHalfX + wt / 2, 0); // near end (+X)
  mkWall(feltHalfX + wt, wt / 2, 0, feltHalfZ + wt / 2); // player side (+Z)
  mkWall(feltHalfX + wt, wt / 2, 0, -(feltHalfZ + wt / 2)); // opposite side (-Z)

  const dice = [0, 1].map(() => {
    const body = new CANNON.Body({
      mass: DICE.mass,
      material: dieMat,
      linearDamping: 0.02,
      angularDamping: 0.05,
      allowSleep: false,
    });
    body.addShape(new CANNON.Box(new CANNON.Vec3(DICE.half, DICE.half, DICE.half)));
    world.addBody(body);
    return body;
  }) as [CANNON.Body, CANNON.Body];

  return { world, dice };
}

/** Uniform random unit quaternion (Shoemake's method). */
function randomQuat(rand: () => number): [number, number, number, number] {
  const u1 = rand();
  const u2 = rand() * 2 * Math.PI;
  const u3 = rand() * 2 * Math.PI;
  const a = Math.sqrt(1 - u1);
  const b = Math.sqrt(u1);
  return [a * Math.sin(u2), a * Math.cos(u2), b * Math.sin(u3), b * Math.cos(u3)];
}

/**
 * Both dice leave one hand together: they share a throw velocity (with small
 * per-die jitter) but have independent orientations and spins.
 */
function launchDice(dice: [CANNON.Body, CANNON.Body], rand: () => number) {
  const vx = -(5.2 + rand() * 1.4);
  const vy = 0.6 + rand() * 0.7;
  const vz = -(0.25 + rand() * 0.7);
  const zBase = 0.16 + rand() * 0.2;

  dice.forEach((body, i) => {
    // Launch from just inside the framed view's right edge.
    const x = TABLE.feltHalfX - 0.52 + (rand() - 0.5) * 0.1;
    const y = 0.16 + rand() * 0.15;
    const z = zBase + i * (0.09 + rand() * 0.06) + (rand() - 0.5) * 0.05;
    body.position.set(x, y, z);
    const [qx, qy, qz, qw] = randomQuat(rand);
    body.quaternion.set(qx, qy, qz, qw);
    body.velocity.set(
      vx + (rand() - 0.5) * 0.35,
      vy + (rand() - 0.5) * 0.25,
      vz + (rand() - 0.5) * 0.35,
    );
    body.angularVelocity.set(
      (rand() - 0.5) * 60,
      (rand() - 0.5) * 60,
      (rand() - 0.5) * 60,
    );
    body.force.setZero();
    body.torque.setZero();
  });
}

function recordFrame(buf: Float32Array, frame: number, dice: [CANNON.Body, CANNON.Body]) {
  let o = frame * FLOATS_PER_FRAME;
  for (const d of dice) {
    buf[o++] = d.position.x;
    buf[o++] = d.position.y;
    buf[o++] = d.position.z;
    buf[o++] = d.quaternion.x;
    buf[o++] = d.quaternion.y;
    buf[o++] = d.quaternion.z;
    buf[o++] = d.quaternion.w;
  }
}

function outOfBounds(d: CANNON.Body): boolean {
  return (
    d.position.y < -0.05 ||
    Math.abs(d.position.x) > TABLE.feltHalfX + TABLE.wallThickness + 0.25 ||
    Math.abs(d.position.z) > TABLE.feltHalfZ + TABLE.wallThickness + 0.25
  );
}

/** Validate a settled die: flat face up, resting on the felt, inside the rails. */
function settledFace(d: CANNON.Body): Die | null {
  const q = d.quaternion;
  const face = topFaceFromQuat({ x: q.x, y: q.y, z: q.z, w: q.w }, SOLVER.flatCosTol);
  if (face === null) return null;
  if (Math.abs(d.position.y - DICE.half) > 0.004) return null; // cocked / stacked
  if (Math.abs(d.position.x) > TABLE.feltHalfX - 0.02) return null;
  // Rest zone: always fully visible, never behind a wall or the phone dock.
  if (d.position.x > SOLVER.restMaxX || d.position.x < SOLVER.restMinX) return null;
  if (Math.abs(d.position.z) > SOLVER.restMaxAbsZ) return null;
  return face;
}

/** Optional per-solve failure tally (surfaced in the fairness panel). */
export type SolveStats = Record<string, number>;

export function solveRoll(
  target: [Die, Die],
  seed: number,
  stats?: SolveStats,
): SolveResult | null {
  const rig = buildRig();
  const buf = new Float32Array((MAX_STEPS + 1) * FLOATS_PER_FRAME);
  let attempts = 0;
  const bump = (k: string) => {
    if (stats) stats[k] = (stats[k] ?? 0) + 1;
  };

  for (let batch = 0; batch < SOLVER.maxBatches; batch++) {
    // Derive a fresh sub-seed per batch so a reseed explores new launches.
    const rand = mulberry32((seed ^ (batch * 0x9e3779b9)) >>> 0);

    for (let i = 0; i < SOLVER.attemptsPerBatch; i++) {
      attempts++;
      const attempt = runAttempt(rig, rand, buf);
      if (attempt === null) {
        bump('unsettled');
        continue;
      }
      const { frameCount, hitFarWall } = attempt;

      const faceA = settledFace(rig.dice[0]);
      const faceB = settledFace(rig.dice[1]);
      if (faceA === null || faceB === null) {
        bump('notClean');
        continue;
      }
      if (!hitFarWall[0] || !hitFarWall[1]) {
        bump('noWallHit');
        continue;
      }
      if (
        rig.dice[0].position.distanceTo(rig.dice[1].position) > SOLVER.maxSeparation
      ) {
        bump('tooFarApart');
        continue;
      }

      // Accept the pair in either order; swap trajectories if needed so the
      // replayed die A always shows target[0] and die B target[1].
      let swap: boolean;
      if (faceA === target[0] && faceB === target[1]) swap = false;
      else if (faceA === target[1] && faceB === target[0]) swap = true;
      else {
        bump('wrongFaces');
        continue;
      }

      const frames = new Float32Array(frameCount * FLOATS_PER_FRAME);
      if (!swap) {
        frames.set(buf.subarray(0, frameCount * FLOATS_PER_FRAME));
      } else {
        for (let f = 0; f < frameCount; f++) {
          const o = f * FLOATS_PER_FRAME;
          for (let k = 0; k < 7; k++) {
            frames[o + k] = buf[o + 7 + k];
            frames[o + 7 + k] = buf[o + k];
          }
        }
      }
      return { frames, frameCount, dt: SOLVER.dt, attempts, seed, faces: [...target] };
    }
  }
  return null;
}

/** Run one throw to settle. Returns frames recorded + wall contacts, or null if invalid. */
function runAttempt(
  rig: PhysicsRig,
  rand: () => number,
  buf: Float32Array,
): { frameCount: number; hitFarWall: [boolean, boolean] } | null {
  const { world, dice } = rig;
  const hitFarWall: [boolean, boolean] = [false, false];

  launchDice(dice, rand);

  let frame = 0;
  recordFrame(buf, frame++, dice);

  let settleAccum = 0;
  let simTime = 0;
  for (let step = 0; step < MAX_STEPS; step++) {
    world.step(SOLVER.dt);
    simTime += SOLVER.dt;
    recordFrame(buf, frame++, dice);

    if (dice[0].position.x <= WALL_CONTACT_X) hitFarWall[0] = true;
    if (dice[1].position.x <= WALL_CONTACT_X) hitFarWall[1] = true;

    if (outOfBounds(dice[0]) || outOfBounds(dice[1])) return null;

    if (simTime > 0.7) {
      const calm = dice.every(
        (d) =>
          d.velocity.length() < SOLVER.settleLinVel &&
          d.angularVelocity.length() < SOLVER.settleAngVel,
      );
      settleAccum = calm ? settleAccum + SOLVER.dt : 0;
      if (settleAccum >= SOLVER.settleTime) {
        // Keep a short still tail, then stop recording.
        for (let t = 0; t < TAIL_FRAMES && frame <= MAX_STEPS; t++) {
          recordFrame(buf, frame++, dice);
        }
        return { frameCount: frame, hitFarWall };
      }
    }
  }
  return null; // never settled
}
