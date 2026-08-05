// Shared dimensions — the visual table and the physics world MUST agree,
// so both import from here. Units are meters, Y is up, felt top is y = 0.
// The table runs along X: the player stands at the +Z rail near the +X end
// and throws toward the far wall at -X.

export const TABLE = {
  /** Half-length of the felt play area (X). */
  feltHalfX: 1.3,
  /** Half-width of the felt play area (Z). */
  feltHalfZ: 0.65,
  /** Inner wall height above the felt. */
  wallHeight: 0.16,
  /** Inner wall thickness. */
  wallThickness: 0.06,
  /** Visible felt slab thickness. */
  feltThickness: 0.08,
  /** Wood rail cap on top of the walls. */
  railWidth: 0.2,
  railHeight: 0.05,
} as const;

export const DICE = {
  /** Half-extent of a die — 30 mm, oversized for readability from the plan view. */
  half: 0.015,
  mass: 0.02,
} as const;

export const SOLVER = {
  /** Fixed physics/recording timestep. */
  dt: 1 / 120,
  maxSimSeconds: 8,
  /** Settle detection: both dice below these for `settleTime` seconds. */
  settleLinVel: 0.012,
  settleAngVel: 0.35,
  settleTime: 0.35,
  /** A die must have contacted the far wall for a valid throw. */
  attemptsPerBatch: 150,
  maxBatches: 6,
  /** Cosine tolerance for "flat on the felt" (≈ 1.8 degrees). */
  flatCosTol: 0.9995,
  /** Dice must come to rest within this distance of each other (real throws cluster). */
  maxSeparation: 0.5,
} as const;

/**
 * One shared threshold: a gesture that ever moves beyond this many pixels is a
 * camera drag (and can never place a bet); one that never does is a click.
 */
export const CLICK_SLOP_PX = 6;

export const CAMERA = {
  /** Eye position at the rail: near-right, above the chip rail. */
  position: { x: 0.38, y: 0.44, z: 0.88 },
  /** Base look target: across the layout toward the far-left. */
  target: { x: -0.42, y: -0.05, z: -0.2 },
  /** Horizontal field of view (degrees) — vertical FOV adapts to aspect. */
  horizontalFov: 52,
  /** Drag-look limits (radians) around the base orientation. Wide enough that
   *  every bet region (incl. the prop block's right edge) is comfortably
   *  reachable with a right drag. */
  maxYaw: 0.72,
  maxPitchUp: 0.15,
  maxPitchDown: 0.22,
} as const;
