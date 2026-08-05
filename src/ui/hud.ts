// DOM/CSS overlay: bankroll, chip rail, remove mode, roll button, result and
// fairness readouts, hover tooltip, toasts. No Three.js in here.

import { CHIP_DENOMS, CHIP_STYLE, type ChipDenom } from '../scene/chips';

export interface HudCallbacks {
  onSelectDenom(d: ChipDenom): void;
  onToggleRemove(active: boolean): void;
  onToggleKeep(active: boolean): void;
  onRoll(): void;
}

export const fmt = (n: number) =>
  Number.isInteger(n)
    ? `$${n.toLocaleString('en-US')}`
    : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export interface BreakdownEntry {
  label: string;
  text: string;
  cls: 'win' | 'lose' | 'push' | 'info';
}

export class Hud {
  private bankrollEl: HTMLElement;
  private onTableEl: HTMLElement;
  private resultEl: HTMLElement;
  private fairEl: HTMLElement;
  private rollBtn: HTMLButtonElement;
  private removeBtn: HTMLButtonElement;
  private tooltipEl: HTMLElement;
  private toastEl: HTMLElement;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private removeMode = false;

  constructor(root: HTMLElement, cb: HudCallbacks) {
    root.insertAdjacentHTML(
      'beforeend',
      `<div id="hud">
        <div id="bank"><span id="bankroll"></span><span id="ontable"></span></div>
        <div id="result"></div>
        <div id="rollnet"></div>
        <div id="breakdown"></div>
        <div id="toast"></div>
        <div id="tooltip"></div>
        <div id="rail">
          <div id="chips"></div>
          <button id="keepBtn" class="active" title="Winning bets stay working; contract bets re-place automatically">KEEP WINNINGS</button>
          <button id="removeBtn" title="Remove mode — click a bet to take chips down">REMOVE</button>
          <button id="roll">ROLL</button>
        </div>
        <div id="fair"></div>
        <div id="session"></div>
      </div>
      <style>
        #hud { position: fixed; inset: 0; pointer-events: none; user-select: none;
               font-family: 'Avenir Next', 'Segoe UI', sans-serif; color: #f0e9d6; }
        #bank { position: absolute; top: 1rem; left: 1.2rem; display: flex; flex-direction: column;
                gap: 2px; text-shadow: 0 2px 8px #000; }
        #bankroll { font-size: 1.5rem; font-weight: 700; letter-spacing: 0.04em; }
        #ontable { font-size: 0.85rem; color: #b8c0a8; }
        #result { position: absolute; top: 4vh; width: 100%; text-align: center; font-size: 2rem;
                  text-shadow: 0 2px 10px #000; letter-spacing: 0.06em; min-height: 2.4rem; }
        #toast { position: absolute; bottom: 118px; width: 100%; text-align: center;
                 font-size: 1rem; color: #ffd9a0; text-shadow: 0 2px 8px #000;
                 opacity: 0; transition: opacity 0.25s; }
        #toast.show { opacity: 1; }
        #tooltip { position: fixed; padding: 4px 10px; background: rgba(12, 16, 14, 0.92);
                   border: 1px solid #3d4a42; border-radius: 6px; font-size: 12px;
                   letter-spacing: 0.05em; display: none; z-index: 5; white-space: nowrap; }
        #rail { position: absolute; left: 50%; bottom: 2.2vh; transform: translateX(-50%);
                display: flex; align-items: center; gap: 14px; pointer-events: auto; }
        #chips { display: flex; gap: 10px; align-items: center; }
        .chip { width: 58px; height: 58px; border-radius: 50%; cursor: pointer; position: relative;
                border: none; font: 700 1.05rem 'Avenir Next', sans-serif;
                box-shadow: 0 4px 10px rgba(0,0,0,0.55), inset 0 0 0 4px rgba(255,255,255,0.14);
                transition: transform 0.12s, box-shadow 0.12s; }
        .chip::after { content: ''; position: absolute; inset: 7px; border-radius: 50%;
                       border: 2px dashed rgba(255,255,255,0.5); pointer-events: none; }
        .chip.dark::after { border-color: rgba(255,255,255,0.55); }
        .chip.light::after { border-color: rgba(0,0,0,0.35); }
        .chip:hover { transform: translateY(-4px); }
        .chip.active { transform: translateY(-8px);
                       box-shadow: 0 10px 18px rgba(0,0,0,0.6), 0 0 0 3px #e8c476,
                                   inset 0 0 0 4px rgba(255,255,255,0.14); }
        #removeBtn { pointer-events: auto; padding: 0.55em 1.1em; font-size: 0.78rem;
                     letter-spacing: 0.16em; color: #e8b0a0; background: rgba(60, 18, 12, 0.75);
                     border: 1px solid #7c3c2e; border-radius: 999px; cursor: pointer; }
        #removeBtn.active { background: #8e2f1d; color: #ffe8dc; box-shadow: 0 0 0 3px rgba(232, 121, 87, 0.4); }
        #keepBtn { pointer-events: auto; padding: 0.55em 1.1em; font-size: 0.78rem;
                   letter-spacing: 0.12em; color: #9fc4a8; background: rgba(14, 40, 24, 0.75);
                   border: 1px solid #2e5c3c; border-radius: 999px; cursor: pointer; }
        #keepBtn.active { background: #1e6b3c; color: #e2f5e6; box-shadow: 0 0 0 3px rgba(90, 200, 130, 0.35); }
        #rollnet { position: absolute; top: calc(4vh + 2.6rem); width: 100%; text-align: center;
                   font-size: 1.55rem; font-weight: 700; letter-spacing: 0.08em;
                   text-shadow: 0 2px 10px #000; min-height: 1.8rem; }
        #rollnet.win { color: #7fe09a; }
        #rollnet.lose { color: #f08a7a; }
        #rollnet.push { color: #d8cfa8; }
        #breakdown { position: absolute; top: calc(4vh + 4.8rem); left: 50%;
                     transform: translateX(-50%); min-width: 240px; max-width: 400px;
                     background: rgba(10, 14, 12, 0.82); border: 1px solid #2c3a32;
                     border-radius: 10px; padding: 8px 14px; font-size: 0.85rem;
                     line-height: 1.5; display: none; }
        #breakdown .row { display: flex; justify-content: space-between; gap: 18px; }
        #breakdown .win { color: #7fe09a; }
        #breakdown .lose { color: #f08a7a; }
        #breakdown .push { color: #d8cfa8; }
        #breakdown .info { color: #8fb2c8; }
        #session { position: absolute; right: 1rem; top: 2.4rem; text-align: right;
                   font: 11px ui-monospace, monospace; color: #8a9aa8; }
        #roll { pointer-events: auto; padding: 0.8em 2.6em; font-size: 1rem; letter-spacing: 0.25em;
                color: #f3e9d5; background: #7a1520; border: 1px solid #c8a45a;
                border-radius: 999px; cursor: pointer; }
        #roll:hover:not(:disabled) { background: #93202c; }
        #roll:disabled { opacity: 0.45; cursor: default; }
        #fair { position: absolute; right: 1rem; top: 0.8rem; text-align: right;
                font: 11px ui-monospace, monospace; color: #6d7a86; max-width: 40vw; }
      </style>`,
    );

    this.bankrollEl = document.getElementById('bankroll')!;
    this.onTableEl = document.getElementById('ontable')!;
    this.resultEl = document.getElementById('result')!;
    this.fairEl = document.getElementById('fair')!;
    this.rollBtn = document.getElementById('roll') as HTMLButtonElement;
    this.removeBtn = document.getElementById('removeBtn') as HTMLButtonElement;
    this.tooltipEl = document.getElementById('tooltip')!;
    this.toastEl = document.getElementById('toast')!;

    const chipsEl = document.getElementById('chips')!;
    for (const d of CHIP_DENOMS.slice().reverse()) {
      const style = CHIP_STYLE[d];
      const btn = document.createElement('button');
      btn.className = `chip ${d === 1 || d === 50 ? 'light' : 'dark'}`;
      btn.style.background = style.base;
      btn.style.color = style.text;
      btn.textContent = `${d}`;
      btn.dataset.denom = `${d}`;
      btn.addEventListener('click', () => {
        chipsEl.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
        btn.classList.add('active');
        cb.onSelectDenom(d);
      });
      chipsEl.appendChild(btn);
    }
    // Default selection: $5.
    (chipsEl.querySelector('[data-denom="5"]') as HTMLButtonElement).classList.add('active');

    this.removeBtn.addEventListener('click', () => {
      this.removeMode = !this.removeMode;
      this.removeBtn.classList.toggle('active', this.removeMode);
      cb.onToggleRemove(this.removeMode);
    });

    const keepBtn = document.getElementById('keepBtn') as HTMLButtonElement;
    keepBtn.addEventListener('click', () => {
      const active = !keepBtn.classList.contains('active');
      keepBtn.classList.toggle('active', active);
      cb.onToggleKeep(active);
    });

    this.rollBtn.addEventListener('click', () => cb.onRoll());
  }

  /** Headline (net for the roll) + per-bet breakdown lines. */
  showRollOutcome(headline: { text: string; cls: 'win' | 'lose' | 'push' } | null, entries: BreakdownEntry[]) {
    const net = document.getElementById('rollnet')!;
    net.textContent = headline?.text ?? '';
    net.className = headline?.cls ?? '';
    const box = document.getElementById('breakdown')!;
    if (!entries.length) {
      box.style.display = 'none';
      box.innerHTML = '';
      return;
    }
    box.innerHTML = entries
      .map(
        (e) =>
          `<div class="row"><span>${e.label}</span><span class="${e.cls}">${e.text}</span></div>`,
      )
      .join('');
    box.style.display = 'block';
  }

  setSession(text: string) {
    document.getElementById('session')!.textContent = text;
  }

  /** Sync the rail keep-winnings button (e.g. when changed from settings). */
  setKeepActive(active: boolean) {
    document.getElementById('keepBtn')!.classList.toggle('active', active);
  }

  setBankroll(bankroll: number, onTable: number) {
    this.bankrollEl.textContent = fmt(bankroll);
    this.onTableEl.textContent = `on table ${fmt(onTable)}`;
  }

  setResult(text: string) {
    this.resultEl.textContent = text;
  }

  setFairness(text: string) {
    this.fairEl.textContent = text;
  }

  setRollEnabled(enabled: boolean) {
    this.rollBtn.disabled = !enabled;
  }

  toast(msg: string) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), 2200);
  }

  tooltip(text: string | null, x: number, y: number) {
    if (!text) {
      this.tooltipEl.style.display = 'none';
      return;
    }
    this.tooltipEl.style.display = 'block';
    this.tooltipEl.textContent = text;
    this.tooltipEl.style.left = `${x + 14}px`;
    this.tooltipEl.style.top = `${y + 16}px`;
  }
}
