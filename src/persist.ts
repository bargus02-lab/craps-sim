// localStorage persistence for bankroll, settings, prefs, stats, and session
// totals. Live bets are folded back into the bankroll on save, so a reload
// never loses money. No backend, no network — and no expiry of any kind.

import { defaultSettings, type Settings, type OddsPolicy } from './engine/state';

export interface Prefs {
  sound: boolean;
  dof: boolean;
  /** Preferred betting view: overhead plan view or first-person rail. */
  view: 'overhead' | 'rail';
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
  /** Recent rolls for the fairness log. */
  log: Array<{ n: number; a: number; b: number; seed: string; attempts: number }>;
}

export interface SessionTotals {
  wagered: number;
  net: number;
}

export interface SaveData {
  v: 1;
  /** Bankroll INCLUDING money currently on the table at save time. */
  bankroll: number;
  settings: Settings;
  prefs: Prefs;
  stats: StatsData;
  session: SessionTotals;
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
  return { sound: true, dof: true, view: 'overhead' };
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
      }));
  }
  return e;
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
        dof: typeof prefsRaw.dof === 'boolean' ? prefsRaw.dof : true,
        view: prefsRaw.view === 'rail' ? 'rail' : 'overhead',
      },
      stats: normStats(d.stats),
      session: { wagered: num(sessionRaw.wagered), net: num(sessionRaw.net) },
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
