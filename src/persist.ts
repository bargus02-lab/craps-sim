// localStorage persistence for bankroll, settings, prefs, stats, and session
// totals. Live bets are folded back into the bankroll on save, so a reload
// never loses money. No backend, no network — and no expiry of any kind.

import {
  defaultSettings,
  type Settings,
  type OddsPolicy,
  type BetTarget,
} from './engine/state';

export interface Prefs {
  sound: boolean;
  dof: boolean;
  /** Preferred betting view: overhead plan view or first-person rail. */
  view: 'overhead' | 'rail';
  /** One-time marker: the perf pass turned DOF off by default for old saves. */
  perfMigrated: boolean;
}

export interface BetRecord {
  wins: number;
  losses: number;
  pushes: number;
  wagered: number;
  net: number;
}

export interface StatsData {
  /** Counts for totals 2..12 (index 0 = total 2). */
  rolls: number[];
  perBet: Record<string, BetRecord>;
  handle: number;
  net: number;
  totalRolls: number;
  /** Recent rolls for the fairness log. `pm` marks a made point. */
  log: Array<{ n: number; a: number; b: number; seed: string; attempts: number; pm?: boolean }>;
}

export interface SessionTotals {
  wagered: number;
  net: number;
}

export interface PresetBet {
  target: BetTarget;
  amount: number;
}

export interface Preset {
  name: string;
  bets: PresetBet[];
}

export const PRESET_COUNT = 10;

/**
 * Slot 1 is the "Gus Bus", per the house recipe: $25 on the 5 and 9, $35 on
 * the 6 and 8 ($120 across the inside). Overwrite with SAVE to customize.
 */
export function defaultPresets(): Preset[] {
  const presets: Preset[] = [
    {
      name: 'Gus Bus',
      bets: [
        { target: { kind: 'place', number: 5 }, amount: 25 },
        { target: { kind: 'place', number: 9 }, amount: 25 },
        { target: { kind: 'place', number: 6 }, amount: 35 },
        { target: { kind: 'place', number: 8 }, amount: 35 },
      ],
    },
  ];
  for (let i = 2; i <= PRESET_COUNT; i++) presets.push({ name: `Preset ${i}`, bets: [] });
  return presets;
}

export interface SaveData {
  v: 1;
  /** Bankroll INCLUDING money currently on the table at save time. */
  bankroll: number;
  settings: Settings;
  prefs: Prefs;
  stats: StatsData;
  session: SessionTotals;
  presets: Preset[];
}

const KEY = 'firstPersonCraps.v1';

export function emptyStats(): StatsData {
  return {
    rolls: new Array(11).fill(0),
    perBet: {},
    handle: 0,
    net: 0,
    totalRolls: 0,
    log: [],
  };
}

export function defaultPrefs(): Prefs {
  // Depth of field is pure eye candy and the most expensive thing on screen —
  // off by default; the settings toggle brings it back.
  return { sound: true, dof: false, view: 'overhead', perfMigrated: true };
}

const num = (v: unknown, fallback = 0) =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

function normOddsPolicy(p: unknown): OddsPolicy {
  if (p && typeof p === 'object') {
    const o = p as { type?: unknown; multiple?: unknown };
    if (o.type === '345') return { type: '345' };
    if (
      o.type === 'flat' &&
      typeof o.multiple === 'number' &&
      Number.isFinite(o.multiple) &&
      o.multiple > 0
    ) {
      return { type: 'flat', multiple: o.multiple };
    }
  }
  return { type: '345' };
}

function normSettings(s: unknown): Settings {
  const d = defaultSettings();
  if (!s || typeof s !== 'object') return d;
  const o = s as Record<string, unknown>;
  const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
  return {
    keepWinningBetsOnTable: bool(o.keepWinningBetsOnTable, d.keepWinningBetsOnTable),
    placeWorkingOnComeOut: bool(o.placeWorkingOnComeOut, d.placeWorkingOnComeOut),
    hardwaysWorkingOnComeOut: bool(o.hardwaysWorkingOnComeOut, d.hardwaysWorkingOnComeOut),
    comeOddsWorkingOnComeOut: bool(o.comeOddsWorkingOnComeOut, d.comeOddsWorkingOnComeOut),
    oddsPolicy: normOddsPolicy(o.oddsPolicy),
  };
}

function normStats(s: unknown): StatsData {
  const e = emptyStats();
  if (!s || typeof s !== 'object') return e;
  const o = s as Record<string, unknown>;
  const rolls = Array.isArray(o.rolls) ? (o.rolls as unknown[]) : [];
  e.rolls = e.rolls.map((_, i) => Math.max(0, Math.floor(num(rolls[i]))));
  if (o.perBet && typeof o.perBet === 'object') {
    for (const [k, v] of Object.entries(o.perBet as Record<string, unknown>)) {
      if (v && typeof v === 'object') {
        const r = v as Record<string, unknown>;
        e.perBet[k] = {
          wins: num(r.wins),
          losses: num(r.losses),
          pushes: num(r.pushes),
          wagered: num(r.wagered),
          net: num(r.net),
        };
      }
    }
  }
  e.handle = num(o.handle);
  e.net = num(o.net);
  e.totalRolls = Math.max(0, Math.floor(num(o.totalRolls)));
  if (Array.isArray(o.log)) {
    e.log = (o.log as unknown[])
      .filter((l): l is Record<string, unknown> => !!l && typeof l === 'object')
      .slice(-30)
      .map((x) => ({
        n: num(x.n),
        a: num(x.a, 1),
        b: num(x.b, 1),
        seed: typeof x.seed === 'string' ? x.seed : '?',
        attempts: num(x.attempts),
        pm: x.pm === true,
      }));
  }
  return e;
}

/** Validate a persisted bet target — unknown shapes become null. */
function normTarget(t: unknown): BetTarget | null {
  if (!t || typeof t !== 'object') return null;
  const o = t as { kind?: unknown; number?: unknown; prop?: unknown };
  const num = o.number;
  switch (o.kind) {
    case 'passLine':
    case 'dontPass':
    case 'come':
    case 'dontCome':
    case 'field':
    case 'passOdds':
    case 'dontPassOdds':
      return { kind: o.kind };
    case 'place':
      return num === 4 || num === 5 || num === 6 || num === 8 || num === 9 || num === 10
        ? { kind: 'place', number: num }
        : null;
    case 'buy':
    case 'lay':
      return num === 4 || num === 10 ? { kind: o.kind, number: num } : null;
    case 'hardway':
      return num === 4 || num === 6 || num === 8 || num === 10
        ? { kind: 'hardway', number: num }
        : null;
    case 'prop': {
      const props = ['any7', 'anyCraps', 'aces', 'boxcars', 'aceDeuce', 'yo', 'horn', 'cAndE'];
      return typeof o.prop === 'string' && props.includes(o.prop)
        ? { kind: 'prop', prop: o.prop as ('any7' | 'anyCraps' | 'aces' | 'boxcars' | 'aceDeuce' | 'yo' | 'horn' | 'cAndE') }
        : null;
    }
    default:
      return null; // big6/big8 and unknown kinds are not preset-able
  }
}

function normPresets(p: unknown): Preset[] {
  const out = defaultPresets();
  if (!Array.isArray(p)) return out;
  for (let i = 0; i < Math.min(p.length, PRESET_COUNT); i++) {
    const raw = p[i] as { name?: unknown; bets?: unknown };
    if (!raw || typeof raw !== 'object') continue;
    const name =
      typeof raw.name === 'string' && raw.name.trim().length > 0
        ? raw.name.slice(0, 24)
        : out[i].name;
    const bets: PresetBet[] = [];
    if (Array.isArray(raw.bets)) {
      for (const b of raw.bets as Array<{ target?: unknown; amount?: unknown }>) {
        const target = normTarget(b?.target);
        const amount = num(b?.amount);
        if (target && amount > 0) bets.push({ target, amount });
      }
    }
    out[i] = { name, bets };
  }
  // The Gus Bus recipe was finalized (25 on 5/9, 35 on 6/8): saves whose slot
  // 1 still carries the stock name get the canonical bets; renamed slots are
  // the player's own and stay untouched.
  if (out[0].name === 'Gus Bus') out[0] = defaultPresets()[0];
  return out;
}

/**
 * Loads and NORMALIZES the save: every field is shape-checked with per-field
 * fallbacks, so a corrupt, truncated, or older save can never crash boot or
 * poison later rolls — worst case it degrades to defaults.
 */
export function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Record<string, unknown>;
    if (d.v !== 1 || typeof d.bankroll !== 'number' || !Number.isFinite(d.bankroll)) {
      return null;
    }
    const prefsRaw = (d.prefs ?? {}) as Record<string, unknown>;
    const sessionRaw = (d.session ?? {}) as Record<string, unknown>;
    return {
      v: 1,
      bankroll: Math.max(0, d.bankroll),
      settings: normSettings(d.settings),
      prefs: {
        sound: typeof prefsRaw.sound === 'boolean' ? prefsRaw.sound : true,
        // Saves from before the perf pass get DOF switched off once; after
        // that the user's own toggle choice sticks.
        dof:
          prefsRaw.perfMigrated === true && typeof prefsRaw.dof === 'boolean'
            ? prefsRaw.dof
            : false,
        view: prefsRaw.view === 'rail' ? 'rail' : 'overhead',
        perfMigrated: true,
      },
      stats: normStats(d.stats),
      session: { wagered: num(sessionRaw.wagered), net: num(sessionRaw.net) },
      presets: normPresets(d.presets),
    };
  } catch {
    return null;
  }
}

export function writeSave(d: SaveData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    // Storage full/blocked — play continues, persistence just pauses.
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
