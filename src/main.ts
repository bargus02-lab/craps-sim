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
  HARDWAY_NUMBERS,
  type BetTarget,
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
  <div id="stackTags"></div>
  <div id="payoutCol"></div>
  <style>
    html, body { margin: 0; height: 100%; overflow: hidden; background: #0a0c10; }
    #stage { position: fixed; inset: 0; }
    #stage canvas { display: block; touch-action: none; }
    #stackTags { position: fixed; inset: 0; pointer-events: none; z-index: 4; }
    .stag { position: fixed; transform: translate(-50%, -100%); white-space: nowrap;
            padding: 1px 7px; border-radius: 999px; font: 700 11px 'Avenir Next', sans-serif;
            letter-spacing: 0.03em; color: #f2ecdd; background: rgba(14, 18, 15, 0.85);
            border: 1px solid rgba(232, 196, 118, 0.65); box-shadow: 0 2px 5px rgba(0,0,0,0.5); }
    #payoutCol { position: fixed; right: 12px; top: 50%; transform: translateY(-50%);
                 display: none; flex-direction: column; gap: 3px; z-index: 5;
                 pointer-events: none; font-family: 'Avenir Next', 'Segoe UI', sans-serif; }
    #payoutCol .pc-head { text-align: center; font-size: 9px; letter-spacing: 0.16em;
                          color: #c8a45a; margin-bottom: 3px; }
    #payoutCol .pc-row { display: flex; align-items: center; gap: 7px;
                         background: rgba(10, 14, 12, 0.82); border: 1px solid #2c3a32;
                         border-radius: 999px; padding: 2px 9px 2px 3px; }
    #payoutCol .pc-num { width: 24px; height: 24px; border-radius: 50%; display: flex;
                         align-items: center; justify-content: center;
                         background: rgba(240, 236, 224, 0.9); color: #23241f;
                         font-size: 12px; font-weight: 700; }
    #payoutCol .pc-row.seven .pc-num { background: #b8352c; color: #f5f0df; }
    #payoutCol .pc-val { font-size: 11.5px; font-weight: 700; min-width: 52px; text-align: right; }
    #payoutCol .pos { color: #7fe09a; }
    #payoutCol .neg { color: #f08a7a; }
    #payoutCol .zero { color: #5d6a60; }
    #payoutCol .pc-hard { font-size: 9.5px; color: #c8b06a; margin-left: 4px; }
    @media (max-width: 900px) {
      #payoutCol { right: 6px; }
      #payoutCol .pc-val { min-width: 44px; font-size: 10.5px; }
    }
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
  onToggleKeep(active) {
    state = updateSettings(state, { keepWinningBetsOnTable: active });
    saveAll();
  },
  onToggleView() {
    prefs.view = prefs.view === 'overhead' ? 'rail' : 'overhead';
    applyView();
    saveAll();
  },
  onRoll: doRoll,
});
hud.setKeepActive(state.settings.keepWinningBetsOnTable);

/** Move the camera to the preferred betting view and match the DOF focus. */
function applyView() {
  view.cameraRig.setMode(prefs.view);
  hud.setViewLabel(prefs.view);
  view.setFocusDistance(prefs.view === 'overhead' ? view.cameraRig.overheadHeight : 1.3);
}
applyView();

// After the settle close-up, zoom back to the betting view on its own — no
// click needed. Any interaction dismisses sooner.
let autoReturn: ReturnType<typeof setTimeout> | null = null;
function cancelAutoReturn() {
  if (autoReturn) {
    clearTimeout(autoReturn);
    autoReturn = null;
  }
}

// Dismissing the dice close-up returns to the preferred betting view.
view.cameraRig.onUserDismiss = () => {
  cancelAutoReturn();
  applyView();
};

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

/** How much is currently riding on a bet target (for hover info). */
function amountFor(t: BetTarget): number {
  const b = state.bets;
  switch (t.kind) {
    case 'passLine':
      return b.passLine;
    case 'passOdds':
      return b.passOdds;
    case 'dontPass':
      return b.dontPass;
    case 'dontPassOdds':
      return b.dontPassOdds;
    case 'come':
      return b.come;
    case 'comeOdds':
      return b.comePoints[t.number]?.odds ?? 0;
    case 'dontCome':
      return b.dontCome;
    case 'dontComeOdds':
      return b.dontComePoints[t.number]?.odds ?? 0;
    case 'place':
      return b.place[t.number] ?? 0;
    case 'buy':
      return b.buy[t.number] ?? 0;
    case 'lay':
      return b.lay[t.number] ?? 0;
    case 'field':
      return b.field;
    case 'big6':
      return b.big6;
    case 'big8':
      return b.big8;
    case 'hardway':
      return b.hardways[t.number] ?? 0;
    case 'prop':
      return b.props[t.prop];
  }
}

// ---- floating stack-total labels over every live bet -----------------------
const stackTagsEl = document.getElementById('stackTags')!;
interface StackTag {
  el: HTMLElement;
  x: number;
  y: number;
  z: number;
}
let stackTags: StackTag[] = [];

function rebuildStackTags() {
  stackTagsEl.innerHTML = '';
  stackTags = [];
  for (const s of chips.labels) {
    const el = document.createElement('span');
    el.className = 'stag';
    el.textContent = fmt(s.amount);
    stackTagsEl.appendChild(el);
    stackTags.push({ el, x: s.x, y: s.topY + 0.006, z: s.z });
  }
}

const tagVec = new THREE.Vector3();
view.onFrame(() => {
  const hide =
    rolling ||
    playback !== null ||
    preRoll !== null ||
    view.cameraRig.isFocusEngaged ||
    view.cameraRig.isAnimating;
  stackTagsEl.style.display = hide ? 'none' : 'block';
  if (hide) return;
  const el = view.renderer.domElement;
  const r = el.getBoundingClientRect();
  for (const t of stackTags) {
    tagVec.set(t.x, t.y, t.z).project(view.cameraRig.camera);
    if (tagVec.z > 1 || Math.abs(tagVec.x) > 1.05 || Math.abs(tagVec.y) > 1.05) {
      t.el.style.display = 'none';
      continue;
    }
    t.el.style.display = 'inline-block';
    t.el.style.left = `${r.left + ((tagVec.x + 1) / 2) * r.width}px`;
    t.el.style.top = `${r.top + ((-tagVec.y + 1) / 2) * r.height}px`;
  }
});

// ---- right-side payout column: net result for every possible next total ----
const payoutColEl = document.getElementById('payoutCol')!;
const EASY_COMBO: Record<number, [1 | 2 | 3 | 4 | 5 | 6, 1 | 2 | 3 | 4 | 5 | 6]> = {
  2: [1, 1],
  3: [1, 2],
  4: [1, 3],
  5: [2, 3],
  6: [2, 4],
  7: [3, 4],
  8: [3, 5],
  9: [4, 5],
  10: [4, 6],
  11: [5, 6],
  12: [6, 6],
};

function netForRoll(a: 1 | 2 | 3 | 4 | 5 | 6, b: 1 | 2 | 3 | 4 | 5 | 6): number {
  const out = resolveRoll(state, a, b);
  let net = 0;
  for (const res of out.resolutions) {
    if (res.outcome === 'win') net += res.winnings;
    else if (res.outcome === 'lose') net -= res.stake;
  }
  return net;
}

function updatePayoutColumn() {
  if (totalOnTable(state.bets) <= 0) {
    payoutColEl.style.display = 'none';
    return;
  }
  payoutColEl.style.display = 'flex';
  const rows: string[] = [`<div class="pc-head">IF IT ROLLS</div>`];
  for (let t = 2; t <= 12; t++) {
    const [a, b] = EASY_COMBO[t];
    const net = netForRoll(a, b);
    // Totals 4/6/8/10 land soft or hard — show the hard variant when it differs.
    let hard = '';
    if ((HARDWAY_NUMBERS as readonly number[]).includes(t)) {
      const h = (t / 2) as 1 | 2 | 3 | 4 | 5 | 6;
      const hardNet = netForRoll(h, h);
      if (hardNet !== net) {
        hard = `<span class="pc-hard">hard ${hardNet >= 0 ? '+' : '−'}${fmt(Math.abs(hardNet))}</span>`;
      }
    }
    const cls = net > 0 ? 'pos' : net < 0 ? 'neg' : 'zero';
    const txt = net > 0 ? `+${fmt(net)}` : net < 0 ? `−${fmt(-net)}` : '—';
    rows.push(
      `<div class="pc-row${t === 7 ? ' seven' : ''}"><span class="pc-num">${t}</span>` +
        `<span class="pc-val ${cls}">${txt}</span>${hard}</div>`,
    );
  }
  payoutColEl.innerHTML = rows.join('');
}

function refresh() {
  chips.update(state.bets);
  rebuildStackTags();
  updatePayoutColumn();
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
  if (!region.target) {
    hud.toast(region.label); // informational cell (e.g. lay only on 4/10)
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
  if (!region.target) {
    hud.toast(region.label);
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
      tryBet(region);
    },
    onRemove(region) {
      tryRemove(region);
    },
    onHover(region, x, y) {
      if (!region) {
        hud.tooltip(null, x, y);
        return;
      }
      const riding = region.target ? amountFor(region.target) : 0;
      hud.tooltip(
        riding > 0 ? `${region.label} — ${fmt(riding)} riding · ctrl+click removes` : region.label,
        x,
        y,
      );
    },
  },
  // Clicks cannot bet while the camera is off the rail view or dice are
  // rolling — latched at pointerdown by the picker.
  () =>
    view.cameraRig.isFocusEngaged ||
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
  hud.setHistory(stats.log.slice(-20).map((l) => l.a + l.b));
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

  // Hold the close-up long enough to read the dice, then return by itself.
  cancelAutoReturn();
  autoReturn = setTimeout(() => {
    autoReturn = null;
    view.cameraRig.release();
    applyView();
  }, 2400);
}

async function doRoll() {
  if (rolling || playback || preRoll) return;
  cancelAutoReturn();
  rolling = true;
  hud.setRollEnabled(false);
  hud.setResult('');
  hud.showRollOutcome(null, []);
  hud.setFairness('solving…');
  // The throw is always watched from the rail, whatever the betting view.
  view.cameraRig.release();
  view.cameraRig.setMode('rail');
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
hud.setHistory(stats.log.slice(-20).map((l) => l.a + l.b));
refresh();
