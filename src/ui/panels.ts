// Stats/fairness panel and settings panel — plain DOM overlays.

import type { Settings, OddsPolicy } from '../engine/state';
import type { Prefs, StatsData } from '../persist';
import { fmt } from './hud';

/** Ways to roll each total 2..12 out of 36. */
const WAYS = [1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1];

export interface PanelCallbacks {
  onSettingsChange(patch: Partial<Settings>): void;
  onPrefsChange(patch: Partial<Prefs>): void;
  onResetBankroll(): void;
  onResetStats(): void;
}

export class Panels {
  private statsEl: HTMLElement;
  private settingsEl: HTMLElement;
  private statsOpen = false;
  private getStats: () => StatsData;

  constructor(
    root: HTMLElement,
    getStats: () => StatsData,
    getSettings: () => Settings,
    getPrefs: () => Prefs,
    cb: PanelCallbacks,
  ) {
    this.getStats = getStats;
    root.insertAdjacentHTML(
      'beforeend',
      `<div id="panelBtns">
        <button id="statsBtn">STATS</button>
        <button id="settingsBtn">SETTINGS</button>
      </div>
      <div id="statsPanel" class="panel"></div>
      <div id="settingsPanel" class="panel"></div>
      <style>
        #panelBtns { position: fixed; top: 5.2rem; left: 1.2rem; display: flex;
                     flex-direction: column; gap: 8px; z-index: 6; }
        @media (max-width: 900px) {
          #panelBtns { top: 11.4rem; }
        }
        #panelBtns button { pointer-events: auto; padding: 0.45em 1em; font: 700 0.68rem 'Avenir Next', sans-serif;
                            letter-spacing: 0.18em; color: #cdd6c8; background: rgba(16, 22, 18, 0.8);
                            border: 1px solid #38443c; border-radius: 8px; cursor: pointer; }
        #panelBtns button:hover { background: rgba(30, 40, 34, 0.9); }
        .panel { position: fixed; top: 0; right: 0; bottom: 0; width: 340px; z-index: 7;
                 background: rgba(9, 13, 11, 0.96); border-left: 1px solid #2c3a32;
                 padding: 18px 20px 24px; overflow-y: auto; display: none;
                 pointer-events: auto; color: #e4ded0;
                 font-family: 'Avenir Next', 'Segoe UI', sans-serif; }
        .panel h2 { margin: 0 0 12px; font-size: 1rem; letter-spacing: 0.2em; color: #c8b878; }
        .panel h3 { margin: 18px 0 8px; font-size: 0.78rem; letter-spacing: 0.14em; color: #9ab29e; }
        .panel .close { position: absolute; top: 10px; right: 14px; background: none; border: none;
                        color: #8a9a8e; font-size: 1.3rem; cursor: pointer; }
        .histrow { display: flex; align-items: center; gap: 8px; font-size: 11px; margin: 2px 0; }
        .histrow .tot { width: 18px; text-align: right; color: #b8c4ba; font-family: ui-monospace, monospace; }
        .histrow .barwrap { flex: 1; position: relative; height: 12px;
                            background: rgba(255,255,255,0.05); border-radius: 3px; }
        .histrow .bar { position: absolute; inset: 0 auto 0 0; background: #4c8f66; border-radius: 3px; }
        .histrow .exp { position: absolute; top: -2px; bottom: -2px; width: 2px; background: #e8c476; }
        .histrow .count { width: 34px; font-family: ui-monospace, monospace; color: #8fa294; }
        .statline { display: flex; justify-content: space-between; font-size: 12.5px; margin: 3px 0; }
        .statline .v { font-family: ui-monospace, monospace; }
        table.bets { width: 100%; border-collapse: collapse; font-size: 11px; }
        table.bets th { text-align: right; color: #8fa294; font-weight: 600; padding: 2px 4px; }
        table.bets th:first-child, table.bets td:first-child { text-align: left; }
        table.bets td { text-align: right; padding: 2px 4px; font-family: ui-monospace, monospace; }
        td.pos { color: #7fe09a; } td.neg { color: #f08a7a; }
        .fairlog { font: 10px ui-monospace, monospace; color: #7d8a80; line-height: 1.6; }
        .setrow { display: flex; justify-content: space-between; align-items: center;
                  font-size: 13px; margin: 10px 0; gap: 12px; }
        .setrow select { background: #16201a; color: #e4ded0; border: 1px solid #38443c;
                         border-radius: 6px; padding: 3px 6px; }
        .switch { position: relative; width: 40px; height: 22px; background: #2a332c;
                  border-radius: 999px; cursor: pointer; transition: background 0.15s; border: none; }
        .switch::after { content: ''; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px;
                         border-radius: 50%; background: #a8b4aa; transition: left 0.15s, background 0.15s; }
        .switch.on { background: #1e6b3c; }
        .switch.on::after { left: 21px; background: #e2f5e6; }
        .danger { margin-top: 6px; width: 100%; padding: 0.5em; font-size: 0.75rem; letter-spacing: 0.12em;
                  color: #e8b0a0; background: rgba(60, 18, 12, 0.6); border: 1px solid #7c3c2e;
                  border-radius: 8px; cursor: pointer; }
        .note { font-size: 10.5px; color: #71806f; line-height: 1.5; margin-top: 4px; }
      </style>`,
    );
    this.statsEl = document.getElementById('statsPanel')!;
    this.settingsEl = document.getElementById('settingsPanel')!;

    document.getElementById('statsBtn')!.addEventListener('click', () => {
      this.statsOpen = !this.statsOpen;
      this.settingsEl.style.display = 'none';
      this.statsEl.style.display = this.statsOpen ? 'block' : 'none';
      if (this.statsOpen) this.renderStats();
    });
    document.getElementById('settingsBtn')!.addEventListener('click', () => {
      this.statsOpen = false;
      this.statsEl.style.display = 'none';
      const open = this.settingsEl.style.display !== 'block';
      this.settingsEl.style.display = open ? 'block' : 'none';
      if (open) this.renderSettings(getSettings(), getPrefs(), cb);
    });
  }

  /** Re-render stats if the panel is open (call after each resolution). */
  refreshStats() {
    if (this.statsOpen) this.renderStats();
  }

  private renderStats() {
    const s = this.getStats();
    // Scale against BOTH the tallest observed bar and the largest expected
    // count, so the gold expectation marker never clips at the edge.
    const maxExpected = (s.totalRolls * 6) / 36;
    const maxCount = Math.max(1, ...s.rolls, maxExpected);
    const hist = s.rolls
      .map((count, i) => {
        const total = i + 2;
        const expected = (s.totalRolls * WAYS[i]) / 36;
        const barW = (count / maxCount) * 100;
        const expX = (expected / maxCount) * 100;
        return `<div class="histrow"><span class="tot">${total}</span>
          <span class="barwrap"><span class="bar" style="width:${barW}%"></span>
          <span class="exp" style="left:${expX}%"></span></span>
          <span class="count">${count}</span></div>`;
      })
      .join('');

    const edge = s.handle > 0 ? ((-s.net / s.handle) * 100).toFixed(2) : '—';
    const rows = Object.entries(s.perBet)
      .sort((a, b) => b[1].wagered - a[1].wagered)
      .map(
        ([label, r]) =>
          `<tr><td>${label}</td><td>${r.wins}–${r.losses}${r.pushes ? '–' + r.pushes : ''}</td>
           <td>${fmt(r.wagered)}</td>
           <td class="${r.net >= 0 ? 'pos' : 'neg'}">${r.net >= 0 ? '+' : '−'}${fmt(Math.abs(r.net))}</td></tr>`,
      )
      .join('');

    const log = s.log
      .slice(-12)
      .reverse()
      .map((l) => `#${l.n} · ${l.a}+${l.b}=${l.a + l.b} · seed ${l.seed} · ${l.attempts} att`)
      .join('<br>');

    this.statsEl.innerHTML = `
      <button class="close" id="statsClose">×</button>
      <h2>STATS</h2>
      <h3>ROLL DISTRIBUTION — ${s.totalRolls} ROLLS (gold line = expected)</h3>
      ${hist}
      <h3>MONEY</h3>
      <div class="statline"><span>Total wagered (handle)</span><span class="v">${fmt(s.handle)}</span></div>
      <div class="statline"><span>Net result</span><span class="v" style="color:${s.net >= 0 ? '#7fe09a' : '#f08a7a'}">${s.net >= 0 ? '+' : '−'}${fmt(Math.abs(s.net))}</span></div>
      <div class="statline"><span>Realized house edge</span><span class="v">${edge}${s.handle > 0 ? '%' : ''}</span></div>
      <h3>PER BET TYPE (W–L${''})</h3>
      <table class="bets"><tr><th>Bet</th><th>Record</th><th>Wagered</th><th>Net</th></tr>${rows || '<tr><td colspan="4">No resolved bets yet</td></tr>'}</table>
      <h3>FAIRNESS</h3>
      <div class="note">Every roll is drawn from crypto.getRandomValues <b>before</b> any physics runs;
      the solver only searches for a trajectory that lands on the pre-drawn faces. Seeds below let you
      audit each throw; the histogram above should track the gold expectation over time.</div>
      <div class="fairlog" style="margin-top:8px">${log || 'No rolls yet'}</div>`;
    document.getElementById('statsClose')!.addEventListener('click', () => {
      this.statsOpen = false;
      this.statsEl.style.display = 'none';
    });
  }

  private renderSettings(settings: Settings, prefs: Prefs, cb: PanelCallbacks) {
    const sw = (id: string, on: boolean) =>
      `<button class="switch ${on ? 'on' : ''}" id="${id}"></button>`;
    const policyValue = (p: OddsPolicy) => (p.type === '345' ? '345' : String(p.multiple));

    this.settingsEl.innerHTML = `
      <button class="close" id="setClose">×</button>
      <h2>SETTINGS</h2>
      <h3>TABLE RULES</h3>
      <div class="setrow"><span>Keep winning bets on table</span>${sw('swKeep', settings.keepWinningBetsOnTable)}</div>
      <div class="setrow"><span>Place &amp; Buy work on come-out</span>${sw('swPlace', settings.placeWorkingOnComeOut)}</div>
      <div class="setrow"><span>Hardways work on come-out</span>${sw('swHard', settings.hardwaysWorkingOnComeOut)}</div>
      <div class="setrow"><span>Come odds work on come-out</span>${sw('swComeOdds', settings.comeOddsWorkingOnComeOut)}</div>
      <div class="setrow"><span>Max odds</span>
        <select id="selOdds">
          <option value="345">3-4-5x</option>
          <option value="2">2x</option>
          <option value="5">5x</option>
          <option value="10">10x</option>
          <option value="100">100x</option>
        </select></div>
      <div class="note">Don't-side odds are capped by potential win. Rule changes apply to new bets/rolls.</div>
      <h3>EXPERIENCE</h3>
      <div class="setrow"><span>Sound</span>${sw('swSound', prefs.sound)}</div>
      <div class="setrow"><span>Depth of field</span>${sw('swDof', prefs.dof)}</div>
      <h3>RESET</h3>
      <button class="danger" id="btnRebuy">RESET BANKROLL TO $1,000</button>
      <button class="danger" id="btnStats">CLEAR STATS &amp; SESSION</button>
      <div class="note">Progress saves locally in your browser. There is no session timeout — the table
      is yours for as long as you want it.</div>`;

    (document.getElementById('selOdds') as HTMLSelectElement).value = policyValue(settings.oddsPolicy);

    const bindSwitch = (id: string, apply: (on: boolean) => void) => {
      const el = document.getElementById(id)!;
      el.addEventListener('click', () => {
        const on = !el.classList.contains('on');
        el.classList.toggle('on', on);
        apply(on);
      });
    };
    bindSwitch('swKeep', (on) => cb.onSettingsChange({ keepWinningBetsOnTable: on }));
    bindSwitch('swPlace', (on) => cb.onSettingsChange({ placeWorkingOnComeOut: on }));
    bindSwitch('swHard', (on) => cb.onSettingsChange({ hardwaysWorkingOnComeOut: on }));
    bindSwitch('swComeOdds', (on) => cb.onSettingsChange({ comeOddsWorkingOnComeOut: on }));
    bindSwitch('swSound', (on) => cb.onPrefsChange({ sound: on }));
    bindSwitch('swDof', (on) => cb.onPrefsChange({ dof: on }));
    (document.getElementById('selOdds') as HTMLSelectElement).addEventListener('change', (e) => {
      const v = (e.target as HTMLSelectElement).value;
      cb.onSettingsChange({
        oddsPolicy: v === '345' ? { type: '345' } : { type: 'flat', multiple: Number(v) },
      });
    });
    document.getElementById('btnRebuy')!.addEventListener('click', () => cb.onResetBankroll());
    document.getElementById('btnStats')!.addEventListener('click', () => cb.onResetStats());
    document.getElementById('setClose')!.addEventListener('click', () => {
      this.settingsEl.style.display = 'none';
    });
  }
}
