// Phase 5: audio + polish. Synthesized dice/chip/win sound, depth of field,
// stats + fairness panel, settings with persistence. No session timeout of
// any kind — the table never kicks you out.

import * as THREE from 'three';
import { createScene } from './scene/scene';
import { DiceSolver } from './dice/solver';
import type { SolveResult } from './dice/solver-core';
import { secureRoll, secureSeed } from './engine/rng';
import {
  createState,
  placeBet,
  reduceBet,
  totalOnTable,
  updateSettings,
  POINT_NUMBERS,
} from './engine/state';
import { resolve as resolveRoll, type Resolution, type RollEvent } from './engine/resolve';
import { ChipRenderer, type ChipDenom } from './scene/chips';
import { LayoutPicker } from './scene/picking';
import { Hud, fmt, type BreakdownEntry } from './ui/hud';
import { Panels } from './ui/panels';
import { LAYOUT_REGIONS, oddsRegionsFor, type LayoutRegion } from './scene/layout';
import { Puck } from './scene/puck';
import { RegionFlash } from './scene/flash';
import { SoundEngine } from './audio/sound';
import { extractAudioTrack, type AudioTrack } from './audio/impacts';
import {
  loadSave,
  writeSave,
  emptyStats,
  defaultPrefs,
  type Prefs,
  type StatsData,
} from './persist';

document.body.innerHTML = `
  <div id="stage"></div>
  <style>
    html, body { margin: 0; height: 100%; overflow: hidden; background: #0a0c10; }
    #stage { position: fixed; inset: 0; }
    #stage canvas { display: block; touch-action: none; }
  </style>`;

const stage = document.getElementById('stage')!;
const view = createScene(stage);
const solver = new DiceSolver();
const sound = new SoundEngine();

// ------------------------------------------------------------ persisted state
const saved = loadSave();
let state = createState({
  bankroll: saved?.bankroll ?? 1000,
  settings: saved?.settings,
});
const prefs: Prefs = { ...defaultPrefs(), ...saved?.prefs };
let stats: StatsData = saved?.stats ?? emptyStats();
const session = { wagered: saved?.session.wagered ?? 0, net: saved?.session.net ?? 0 };

sound.setEnabled(prefs.sound);
view.setDof(prefs.dof);

function saveAll() {
  writeSave({
    v: 1,
    // Live bets fold back into the bankroll so a reload never loses money.
    bankroll: state.bankroll + totalOnTable(state.bets),
    settings: state.settings,
    prefs,
    stats,
    session,
  });
}
window.addEventListener('beforeunload', saveAll);

// Unlock/resume audio on any gesture — pointer OR keyboard (autoplay policy).
document.addEventListener('pointerdown', () => sound.unlock(), { capture: true });
document.addEventListener('keydown', () => sound.unlock(), { capture: true });

// rAF pauses in hidden tabs but the AudioContext keeps rendering — silence
// the rolling loop so a backgrounded mid-roll tab doesn't drone forever.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) sound.stopRolling();
});

// ------------------------------------------------------------- table pieces
let activeDenom: ChipDenom = 5;
let removeMode = false;
let rolling = false;
let rollCount = stats.totalRolls;

const chips = new ChipRenderer();
view.scene.add(chips.group);
const puck = new Puck();
view.scene.add(puck.mesh);
const flash = new RegionFlash();
view.scene.add(flash.group);
view.onFrame((delta) => {
  puck.update(delta);
  flash.update(delta);
});

const hud = new Hud(document.body, {
  onSelectDenom(d) {
    activeDenom = d;
  },
  onToggleRemove(active) {
    removeMode = active;
  },
  onToggleKeep(active) {
    state = updateSettings(state, { keepWinningBetsOnTable: active });
    saveAll();
  },
  onRoll: doRoll,
});
hud.setKeepActive(state.settings.keepWinningBetsOnTable);

const panels = new Panels(
  document.body,
  () => stats,
  () => state.settings,
  () => prefs,
  {
    onSettingsChange(patch) {
      state = updateSettings(state, patch);
      hud.setKeepActive(state.settings.keepWinningBetsOnTable);
      saveAll();
    },
    onPrefsChange(patch) {
      Object.assign(prefs, patch);
      sound.setEnabled(prefs.sound);
      view.setDof(prefs.dof);
      saveAll();
    },
    onResetBankroll() {
      if (rolling || playback || preRoll) {
        hud.toast('Wait for the roll to finish');
        return;
      }
      state = createState({ bankroll: 1000, settings: state.settings });
      puck.setPoint(null);
      hud.toast('Bankroll reset to $1,000 — fresh come-out');
      refresh();
    },
    onResetStats() {
      stats = emptyStats();
      session.wagered = 0;
      session.net = 0;
      rollCount = 0; // fairness-log numbering restarts with the stats
      panels.refreshStats();
      hud.toast('Stats and session cleared');
      refresh();
    },
  },
);

function refresh() {
  chips.update(state.bets);
  hud.setBankroll(state.bankroll, totalOnTable(state.bets));
  hud.setSession(
    `session · wagered ${fmt(session.wagered)} · net ${session.net >= 0 ? '+' : '−'}${fmt(Math.abs(session.net))}`,
  );
  saveAll();
}

function tryBet(region: LayoutRegion) {
  if (rolling || playback || preRoll) {
    hud.toast('No more bets — the dice are rolling');
    return;
  }
  try {
    state = placeBet(state, region.target, activeDenom);
    sound.chip();
    refresh();
  } catch (err) {
    hud.toast(err instanceof Error ? err.message : String(err));
  }
}

function tryRemove(region: LayoutRegion) {
  if (rolling || playback || preRoll) {
    hud.toast('No more bets — the dice are rolling');
    return;
  }
  try {
    state = reduceBet(state, region.target, activeDenom);
    sound.chip();
    refresh();
  } catch (err) {
    hud.toast(err instanceof Error ? err.message : String(err));
  }
}

new LayoutPicker(
  view.renderer.domElement,
  view.cameraRig.camera,
  view.scene,
  {
    onBet(region) {
      if (removeMode) tryRemove(region);
      else tryBet(region);
    },
    onRemove(region) {
      tryRemove(region);
    },
    onHover(region, x, y) {
      hud.tooltip(region ? region.label : null, x, y);
    },
  },
  // Clicks cannot bet while the camera is off the rail view or dice are
  // rolling — latched at pointerdown by the picker.
  () =>
    view.cameraRig.isOffRail ||
    view.cameraRig.isAnimating ||
    rolling ||
    playback !== null ||
    preRoll !== null,
  () =>
    oddsRegionsFor(
      POINT_NUMBERS.filter((n) => !!state.bets.comePoints[n]),
      POINT_NUMBERS.filter((n) => !!state.bets.dontComePoints[n]),
    ),
);

// --------------------------------------------------------- resolution display

function betLabel(id: string): string {
  const region = LAYOUT_REGIONS.find((r) => r.id === id);
  if (region) return region.label;
  const m = id.match(/^(comePoint|comeOdds|dontComePoint|dontComeOdds):(\d+)$/);
  if (m) {
    const n = m[2];
    switch (m[1]) {
      case 'comePoint':
        return `Come ${n}`;
      case 'comeOdds':
        return `Come Odds ${n}`;
      case 'dontComePoint':
        return `Don't Come ${n}`;
      case 'dontComeOdds':
        return `Don't Come Odds ${n}`;
    }
  }
  return id;
}

function eventText(event: RollEvent, total: number): string {
  switch (event) {
    case 'pointEstablished':
      return `point is ${total}`;
    case 'pointMade':
      return 'point made';
    case 'sevenOut':
      return 'seven out';
    case 'comeOutNatural':
      return total === 7 ? 'seven — winner' : 'yo — winner';
    case 'comeOutCraps':
      return 'craps';
    default:
      return '';
  }
}

const FLASH_COLORS: Record<Resolution['outcome'], string> = {
  win: '#4ade80',
  lose: '#ef4444',
  push: '#eab308',
  return: '#eab308',
  travel: '#60a5fa',
};

function describeResolution(res: Resolution): BreakdownEntry {
  const label = betLabel(res.bet);
  switch (res.outcome) {
    case 'win':
      return { label, text: `+${fmt(res.winnings)}`, cls: 'win' };
    case 'lose':
      return { label, text: `−${fmt(res.stake)}`, cls: 'lose' };
    case 'push':
      return { label, text: 'push', cls: 'push' };
    case 'return':
      return { label, text: `${fmt(res.stake)} returned`, cls: 'push' };
    case 'travel':
      return { label, text: 'travels', cls: 'info' };
  }
}

// ------------------------------------------------------------- dice replay
interface Playback {
  r: SolveResult;
  track: AudioTrack;
  t: number;
  nextImpact: number;
}
/** Short slide of the dice from their rest spot to the launch position. */
interface PreRoll {
  r: SolveResult;
  track: AudioTrack;
  t: number;
  from: Array<{ pos: THREE.Vector3; quat: THREE.Quaternion }>;
}
const PRE_ROLL_S = 0.3;

let playback: Playback | null = null;
let preRoll: PreRoll | null = null;

const posA = new THREE.Vector3();
const posB = new THREE.Vector3();
const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();
const qTmp = new THREE.Quaternion();

function readFrame(
  frames: Float32Array,
  f: number,
  die: 0 | 1,
  p: THREE.Vector3,
  q: THREE.Quaternion,
) {
  const o = f * 14 + die * 7;
  p.set(frames[o], frames[o + 1], frames[o + 2]);
  q.set(frames[o + 3], frames[o + 4], frames[o + 5], frames[o + 6]);
}

function applyFrame(r: SolveResult, frame: number, alpha: number) {
  for (const die of [0, 1] as const) {
    const mesh = view.dice[die];
    readFrame(r.frames, frame, die, posA, qa);
    if (alpha > 0 && frame + 1 < r.frameCount) {
      readFrame(r.frames, frame + 1, die, posB, qb);
      posA.lerp(posB, alpha);
      qTmp.slerpQuaternions(qa, qb, alpha);
      mesh.position.copy(posA);
      mesh.quaternion.copy(qTmp);
    } else {
      mesh.position.copy(posA);
      mesh.quaternion.copy(qa);
    }
  }
}

view.onFrame((delta) => {
  if (preRoll) {
    preRoll.t += delta;
    const k = Math.min(1, preRoll.t / PRE_ROLL_S);
    const ease = k * k * (3 - 2 * k);
    for (const die of [0, 1] as const) {
      readFrame(preRoll.r.frames, 0, die, posA, qa);
      const mesh = view.dice[die];
      mesh.position.lerpVectors(preRoll.from[die].pos, posA, ease);
      mesh.position.y += Math.sin(ease * Math.PI) * 0.06; // small pickup arc
      mesh.quaternion.slerpQuaternions(preRoll.from[die].quat, qa, ease);
    }
    if (k >= 1) {
      playback = { r: preRoll.r, track: preRoll.track, t: 0, nextImpact: 0 };
      preRoll = null;
    }
    return;
  }

  if (!playback) return;
  playback.t += delta;

  // Collision-driven audio from the recorded trajectory.
  const track = playback.track;
  while (
    playback.nextImpact < track.impacts.length &&
    track.impacts[playback.nextImpact].t <= playback.t
  ) {
    const imp = track.impacts[playback.nextImpact++];
    sound.impact(imp.kind, imp.intensity);
  }

  const f = playback.t / playback.r.dt;
  const frame = Math.floor(f);
  if (frame >= playback.r.frameCount - 1) {
    const r = playback.r;
    playback = null; // cleared first: even a throw below can never resolve twice
    sound.stopRolling();
    applyFrame(r, r.frameCount - 1, 0);
    try {
      finishRoll(r);
    } finally {
      rolling = false;
      hud.setRollEnabled(true);
    }
  } else {
    sound.setRolling(track.rolling[Math.min(frame, track.rolling.length - 1)]);
    applyFrame(playback.r, frame, f - frame);
  }
});

function finishRoll(r: SolveResult) {
  const [a, b] = r.faces;
  const total = a + b;

  // The dice fed to the engine ARE the pre-drawn faces the replay showed.
  const out = resolveRoll(state, a, b);
  state = out.state;

  let rollNet = 0;
  const entries: BreakdownEntry[] = [];
  for (const res of out.resolutions) {
    const label = betLabel(res.bet);
    // Only money-resolving outcomes get a stats row — travels/returns would
    // otherwise create phantom all-zero records.
    const rec =
      res.outcome === 'win' || res.outcome === 'lose' || res.outcome === 'push'
        ? (stats.perBet[label] ??= { wins: 0, losses: 0, pushes: 0, wagered: 0, net: 0 })
        : null;
    if (rec && res.outcome === 'win') {
      rollNet += res.winnings;
      session.wagered += res.stake;
      session.net += res.winnings;
      rec.wins++;
      rec.wagered += res.stake;
      rec.net += res.winnings;
      stats.handle += res.stake;
      stats.net += res.winnings;
    } else if (rec && res.outcome === 'lose') {
      rollNet -= res.stake;
      session.wagered += res.stake;
      session.net -= res.stake;
      rec.losses++;
      rec.wagered += res.stake;
      rec.net -= res.stake;
      stats.handle += res.stake;
      stats.net -= res.stake;
    } else if (rec && res.outcome === 'push') {
      session.wagered += res.stake;
      rec.pushes++;
      rec.wagered += res.stake;
      stats.handle += res.stake;
    }
    entries.push(describeResolution(res));
    flash.flashBet(res.bet, FLASH_COLORS[res.outcome]);
  }

  stats.totalRolls++;
  stats.rolls[total - 2]++;
  stats.log.push({
    n: rollCount,
    a,
    b,
    seed: `0x${r.seed.toString(16).padStart(8, '0')}`,
    attempts: r.attempts,
  });
  if (stats.log.length > 30) stats.log.splice(0, stats.log.length - 30);
  panels.refreshStats();

  if (rollNet > 0) sound.win(rollNet);

  const evt = eventText(out.event, total);
  hud.setResult(`${a} + ${b} = ${total}${evt ? '  ·  ' + evt : ''}`);
  hud.showRollOutcome(
    entries.length
      ? rollNet > 0
        ? { text: `WIN  +${fmt(rollNet)}`, cls: 'win' }
        : rollNet < 0
          ? { text: `−${fmt(-rollNet)}`, cls: 'lose' }
          : { text: 'EVEN', cls: 'push' }
      : null,
    entries,
  );

  puck.setPoint(state.point);
  refresh();

  const mid = new THREE.Vector3()
    .addVectors(view.dice[0].position, view.dice[1].position)
    .multiplyScalar(0.5);
  const sep = view.dice[0].position.distanceTo(view.dice[1].position);
  const d = Math.max(0.42, sep * 1.7);
  const eye = new THREE.Vector3(mid.x + d * 0.4, Math.max(0.28, d * 0.7), mid.z + d * 0.65);
  view.cameraRig.pushTo(eye, mid);
  view.setFocusDistance(eye.distanceTo(mid));
}

async function doRoll() {
  if (rolling || playback || preRoll) return;
  rolling = true;
  hud.setRollEnabled(false);
  hud.setResult('');
  hud.showRollOutcome(null, []);
  hud.setFairness('solving…');
  view.cameraRig.release();
  view.setFocusDistance(1.3);

  const target = secureRoll();
  const seed = secureSeed();
  const started = performance.now();
  try {
    const r = await solver.solve(target, seed);
    const ms = Math.round(performance.now() - started);
    rollCount++;
    hud.setFairness(
      `roll #${rollCount} · target drawn before physics · seed 0x${r.seed
        .toString(16)
        .padStart(8, '0')} · ${r.attempts} attempts · ${ms}ms`,
    );
    const track = extractAudioTrack(r.frames, r.frameCount, r.dt);
    preRoll = {
      r,
      track,
      t: 0,
      from: view.dice.map((m) => ({
        pos: m.position.clone(),
        quat: m.quaternion.clone(),
      })),
    };
  } catch (err) {
    hud.setResult('Roll failed — try again');
    hud.setFairness(String(err));
    rolling = false;
    hud.setRollEnabled(true);
  }
}

// Debug handle for headless driving/inspection (harmless in production).
(window as unknown as Record<string, unknown>).__craps = {
  view,
  sound,
  get state() {
    return state;
  },
  get stats() {
    return stats;
  },
};

puck.setPoint(state.point);
refresh();
