// DOM/CSS overlay: bankroll, chip rail, remove mode, roll button, result and
// fairness readouts, hover tooltip, toasts. No Three.js in here.

import { CHIP_DENOMS, CHIP_STYLE, type ChipDenom } from '../scene/chips';

export interface PresetRow {
  name: string;
  cost: number;
}

export interface HudCallbacks {
  onSelectDenom(d: ChipDenom): void;
  onToggleKeep(active: boolean): void;
  onToggleView(): void;
  onRoll(): void;
  getPresets(): PresetRow[];
  onApplyPreset(i: number): void;
  onSavePreset(i: number): void;
  onRenamePreset(i: number): void;
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
  private tooltipEl: HTMLElement;
  private toastEl: HTMLElement;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(root: HTMLElement, cb: HudCallbacks) {
    root.insertAdjacentHTML(
      'beforeend',
      `<div id="hud">
        <div id="bank">
          <div class="pill"><span class="pill-label">BALANCE</span><span id="bankroll"></span></div>
          <div class="pill"><span class="pill-label">TOTAL BET</span><span id="ontable"></span></div>
        </div>
        <div id="history"></div>
        <div id="rotateHint">Rotate your phone for the full table&nbsp;↻</div>
        <div id="bigNum"></div>
        <div id="presetPanel"></div>
        <div id="result"></div>
        <div id="rollnet"></div>
        <div id="breakdown"></div>
        <div id="toast"></div>
        <div id="tooltip"></div>
        <div id="rail">
          <div id="chips"></div>
          <button id="keepBtn" class="active" title="Winning bets stay working; contract bets re-place automatically">KEEP WINNINGS</button>
          <button id="presetBtn" title="Betting presets — save and re-place whole layouts in one click">PRESETS</button>
          <button id="viewBtn" title="Switch between the overhead betting view and the first-person rail view"></button>
          <button id="roll">ROLL</button>
        </div>
        <div id="fair"></div>
        <div id="session"></div>
      </div>
      <style>
        #hud { position: fixed; inset: 0; pointer-events: none; user-select: none;
               font-family: 'Avenir Next', 'Segoe UI', sans-serif; color: #f0e9d6; }
        #bank { position: absolute; bottom: 2.2vh; left: 1.2rem; display: flex; gap: 10px; }
        #bank .pill { display: flex; flex-direction: column; align-items: center; min-width: 110px;
                      padding: 5px 16px; border: 1.5px solid #c8a45a; border-radius: 999px;
                      background: rgba(10, 12, 10, 0.78); }
        #bank .pill-label { font-size: 0.58rem; letter-spacing: 0.22em; color: #c8a45a; }
        #bankroll, #ontable { font-size: 1.05rem; font-weight: 700; letter-spacing: 0.03em; }
        #history { position: absolute; top: 0.7rem; left: 50%; transform: translateX(-50%);
                   display: flex; gap: 6px; align-items: center; }
        #history .h { width: 26px; height: 26px; border-radius: 50%; display: flex;
                      align-items: center; justify-content: center; font-size: 12px; font-weight: 700;
                      background: rgba(240, 236, 224, 0.88); color: #23241f;
                      box-shadow: 0 2px 6px rgba(0,0,0,0.5); }
        #history .h.seven { background: #b8352c; color: #f5f0df; }
        #history .h.point { background: #1e8c4f; color: #f2fbef; }
        #history .h:last-child { outline: 2px solid #e8c476; outline-offset: 1px; }
        #result { display: flex; align-items: center; justify-content: center; gap: 10px; }
        #result .dr { width: 36px; height: 36px; filter: drop-shadow(0 3px 5px rgba(0,0,0,0.6)); }
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
                display: flex; align-items: center; gap: 14px; pointer-events: auto;
                flex-wrap: wrap; justify-content: center; max-width: 96vw; }
        #chips { display: flex; gap: 10px; align-items: center; }
        .chip { width: 82px; height: 82px; border-radius: 50%; cursor: pointer; position: relative;
                border: none; font: 700 1.5rem 'Avenir Next', sans-serif;
                box-shadow: 0 5px 12px rgba(0,0,0,0.55), inset 0 0 0 5px rgba(255,255,255,0.14);
                transition: transform 0.12s, box-shadow 0.12s; }
        .chip::after { content: ''; position: absolute; inset: 9px; border-radius: 50%;
                       border: 3px dashed rgba(255,255,255,0.5); pointer-events: none; }
        .chip.dark::after { border-color: rgba(255,255,255,0.55); }
        .chip.light::after { border-color: rgba(0,0,0,0.35); }
        .chip:hover { transform: translateY(-5px); }
        .chip.active { transform: translateY(-10px);
                       box-shadow: 0 12px 20px rgba(0,0,0,0.6), 0 0 0 4px #e8c476,
                                   inset 0 0 0 5px rgba(255,255,255,0.14); }
        #keepBtn { pointer-events: auto; padding: 0.8em 1.4em; font-size: 0.92rem;
                   letter-spacing: 0.12em; color: #9fc4a8; background: rgba(14, 40, 24, 0.75);
                   border: 1px solid #2e5c3c; border-radius: 999px; cursor: pointer; }
        #keepBtn.active { background: #1e6b3c; color: #e2f5e6; box-shadow: 0 0 0 3px rgba(90, 200, 130, 0.35); }
        #viewBtn, #presetBtn { pointer-events: auto; padding: 0.8em 1.4em; font-size: 0.92rem;
                   letter-spacing: 0.12em; color: #b8c8d8; background: rgba(18, 28, 40, 0.75);
                   border: 1px solid #3a4e64; border-radius: 999px; cursor: pointer; }
        #viewBtn:hover, #presetBtn:hover { background: rgba(30, 46, 64, 0.9); }
        #presetBtn { color: #d8c8a0; background: rgba(40, 32, 14, 0.75); border-color: #64543a; }
        #presetBtn:hover { background: rgba(58, 47, 22, 0.9); }
        #bigNum { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) scale(0.7);
                  font: 800 17vmin 'Avenir Next', sans-serif; color: #f5f0df;
                  text-shadow: 0 0 40px rgba(0,0,0,0.85), 0 6px 24px rgba(0,0,0,0.9);
                  opacity: 0; pointer-events: none; z-index: 8;
                  transition: opacity 0.22s ease, transform 0.22s ease; }
        #bigNum.show { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        #bigNum.seven { color: #ff7a6a; }
        #presetPanel { position: absolute; left: 50%; bottom: 150px; transform: translateX(-50%);
                       width: 340px; max-height: 52vh; overflow-y: auto; display: none;
                       background: rgba(9, 13, 11, 0.96); border: 1px solid #64543a;
                       border-radius: 12px; padding: 10px 12px; pointer-events: auto; z-index: 6; }
        #presetPanel .pp-head { font-size: 0.72rem; letter-spacing: 0.22em; color: #d8c8a0;
                                text-align: center; margin-bottom: 8px; }
        .pp-row { display: flex; align-items: center; gap: 8px; padding: 5px 4px;
                  border-bottom: 1px solid rgba(100, 84, 58, 0.25); }
        .pp-row:last-child { border-bottom: none; }
        .pp-name { flex: 1; font-size: 0.9rem; color: #ece5d2; overflow: hidden;
                   text-overflow: ellipsis; white-space: nowrap; }
        .pp-cost { font: 700 0.8rem ui-monospace, monospace; color: #b8c0a8; min-width: 44px;
                   text-align: right; }
        .pp-row button { border-radius: 7px; border: 1px solid #4a5a4e; cursor: pointer;
                         background: rgba(24, 34, 28, 0.9); color: #cfe0d2;
                         font: 700 0.68rem 'Avenir Next', sans-serif; letter-spacing: 0.08em;
                         padding: 5px 9px; }
        .pp-row button:hover { background: rgba(40, 56, 46, 0.95); }
        .pp-row .pp-bet { background: #1e6b3c; border-color: #2e8c50; color: #e8f8ec; }
        .pp-row .pp-bet:disabled { opacity: 0.35; cursor: default; }
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
        /* Kill iOS double-tap zoom / 300ms delay on every control. */
        #hud button { touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
        #rail { padding-bottom: env(safe-area-inset-bottom, 0px); }
        #rotateHint { display: none; position: fixed; top: 3.4rem; left: 50%;
                      transform: translateX(-50%); padding: 6px 16px; z-index: 6;
                      background: rgba(10, 14, 12, 0.88); border: 1px solid #c8a45a;
                      border-radius: 999px; color: #e8dcba; font-size: 12px;
                      letter-spacing: 0.06em; pointer-events: none; white-space: nowrap; }
        #roll { pointer-events: auto; width: 112px; height: 112px; border-radius: 50%;
                font-size: 1.18rem; letter-spacing: 0.16em; font-weight: 800;
                color: #fdf8e7; cursor: pointer; position: relative;
                background: radial-gradient(circle at 35% 28%, #2e6a45, #123524 55%, #081711 100%);
                border: 3.5px solid #e3c05c;
                text-shadow: 0 2px 8px rgba(0,0,0,0.8);
                animation: rollGlow 2.1s ease-in-out infinite;
                transition: transform 0.12s ease; }
        #roll::after { content: ''; position: absolute; inset: 7px; border-radius: 50%;
                       border: 1.5px dashed rgba(227, 192, 92, 0.55); pointer-events: none; }
        #roll:hover:not(:disabled) { transform: scale(1.08);
                background: radial-gradient(circle at 35% 28%, #3c8a5a, #17452f 55%, #0a1d15 100%);
                animation-duration: 1.1s; }
        #roll:active:not(:disabled) { transform: scale(0.95); }
        #roll:disabled { opacity: 0.45; cursor: default; animation: none; }
        @keyframes rollGlow {
          0%, 100% { box-shadow: 0 6px 18px rgba(0,0,0,0.65), 0 0 16px rgba(227, 192, 92, 0.3),
                                 inset 0 0 14px rgba(63, 174, 106, 0.25); }
          50% { box-shadow: 0 6px 18px rgba(0,0,0,0.65), 0 0 34px rgba(227, 192, 92, 0.65),
                            inset 0 0 20px rgba(63, 174, 106, 0.4); }
        }
        #fair { position: absolute; right: 1rem; top: 0.8rem; text-align: right;
                font: 11px ui-monospace, monospace; color: #6d7a86; max-width: 40vw; }
        /* ---- responsive blocks LAST so they beat the base rules ---- */
        @media (max-width: 900px) {
          #result { font-size: 1.3rem; top: 8.5rem; }
          #rollnet { font-size: 1.1rem; top: 10.2rem; }
          #breakdown { top: 12rem; }
          #fair { max-width: 60vw; }
          #session { top: 4.6rem; }
          /* Keep the money pills clear of the wrapped chip rail. */
          #bank { bottom: auto; top: 3.4rem; flex-direction: column; gap: 6px; }
        }
        /* Phones (portrait OR landscape): one-row dock on the left, ROLL
           pinned to the bottom-right corner — nothing stacks over the felt. */
        @media (max-width: 640px), (max-height: 500px) {
          .chip { width: 54px; height: 54px; font-size: 0.95rem; }
          .chip::after { inset: 5px; border-width: 2px; }
          #keepBtn, #viewBtn, #presetBtn { padding: 0.5em 0.75em; font-size: 0.66rem; }
          #rail { gap: 7px; flex-wrap: nowrap; transform: none;
                  left: max(0.7rem, env(safe-area-inset-left, 0px));
                  right: auto; max-width: calc(100vw - 118px);
                  overflow-x: auto; scrollbar-width: none;
                  bottom: calc(1vh + env(safe-area-inset-bottom, 0px)); }
          #roll { position: fixed; width: 84px; height: 84px; font-size: 0.9rem;
                  right: max(0.8rem, env(safe-area-inset-right, 0px));
                  bottom: calc(0.8rem + env(safe-area-inset-bottom, 0px)); }
          #bank { left: max(0.6rem, env(safe-area-inset-left, 0px)); }
          #bank .pill { min-width: 84px; padding: 3px 10px; }
          #bankroll, #ontable { font-size: 0.9rem; }
          #history .h { width: 20px; height: 20px; font-size: 10px; }
          #result .dr { width: 26px; height: 26px; }
          #presetPanel { width: 92vw; bottom: 110px; }
          #rotateHint { top: 30%; }
        }
        @media (orientation: portrait) and (max-width: 640px) {
          #rotateHint { display: block; }
        }
      </style>`,
    );

    this.bankrollEl = document.getElementById('bankroll')!;
    this.onTableEl = document.getElementById('ontable')!;
    this.resultEl = document.getElementById('result')!;
    this.fairEl = document.getElementById('fair')!;
    this.rollBtn = document.getElementById('roll') as HTMLButtonElement;
    this.tooltipEl = document.getElementById('tooltip')!;
    this.toastEl = document.getElementById('toast')!;

    const chipsEl = document.getElementById('chips')!;
    for (const d of CHIP_DENOMS.slice().reverse()) {
      const style = CHIP_STYLE[d];
      const btn = document.createElement('button');
      btn.className = `chip ${d === 1 ? 'light' : 'dark'}`;
      // Same design as the 3D chips: colored face with accent edge spots
      // (conic ring) and a solid center disc.
      const spots: string[] = [];
      for (let i = 0; i < 6; i++) {
        const a0 = i * 60 - 13;
        spots.push(`${style.accent} ${a0}deg ${a0 + 26}deg`, `${style.base} ${a0 + 26}deg ${a0 + 47}deg`);
      }
      btn.style.background =
        `radial-gradient(circle, ${style.base} 60%, transparent 61%), ` +
        `conic-gradient(${spots.join(', ')})`;
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

    const keepBtn = document.getElementById('keepBtn') as HTMLButtonElement;
    keepBtn.addEventListener('click', () => {
      const active = !keepBtn.classList.contains('active');
      keepBtn.classList.toggle('active', active);
      cb.onToggleKeep(active);
    });

    document.getElementById('viewBtn')!.addEventListener('click', () => cb.onToggleView());

    this.presetCb = cb;
    document.getElementById('presetBtn')!.addEventListener('click', () => {
      const panel = document.getElementById('presetPanel')!;
      const open = panel.style.display !== 'block';
      panel.style.display = open ? 'block' : 'none';
      if (open) this.renderPresets();
    });

    this.rollBtn.addEventListener('click', () => cb.onRoll());
  }

  private presetCb!: HudCallbacks;

  /** (Re)draw the preset list — call after saves/renames while open. */
  renderPresets() {
    const panel = document.getElementById('presetPanel')!;
    if (panel.style.display !== 'block') return;
    const rows = this.presetCb.getPresets();
    panel.innerHTML =
      `<div class="pp-head">PRESETS — BET places the layout, SAVE stores your current bets</div>` +
      rows
        .map(
          (p, i) =>
            `<div class="pp-row" data-i="${i}">
              <span class="pp-name">${i + 1}. ${p.name.replace(/[<>&]/g, '')}</span>
              <span class="pp-cost">${p.cost > 0 ? fmt(p.cost) : '—'}</span>
              <button class="pp-bet" data-a="${i}" ${p.cost > 0 ? '' : 'disabled'}>BET</button>
              <button data-s="${i}">SAVE</button>
              <button data-r="${i}">✎</button>
            </div>`,
        )
        .join('');
    panel.querySelectorAll<HTMLButtonElement>('[data-a]').forEach((b) =>
      b.addEventListener('click', () => this.presetCb.onApplyPreset(Number(b.dataset.a))),
    );
    panel.querySelectorAll<HTMLButtonElement>('[data-s]').forEach((b) =>
      b.addEventListener('click', () => this.presetCb.onSavePreset(Number(b.dataset.s))),
    );
    panel.querySelectorAll<HTMLButtonElement>('[data-r]').forEach((b) =>
      b.addEventListener('click', () => this.presetCb.onRenamePreset(Number(b.dataset.r))),
    );
  }

  closePresets() {
    document.getElementById('presetPanel')!.style.display = 'none';
  }

  /** The rolled total, huge in the center of the screen for a beat. */
  private bigNumTimer: ReturnType<typeof setTimeout> | null = null;
  flashNumber(total: number) {
    const el = document.getElementById('bigNum')!;
    el.textContent = `${total}`;
    el.classList.toggle('seven', total === 7);
    el.classList.add('show');
    if (this.bigNumTimer) clearTimeout(this.bigNumTimer);
    this.bigNumTimer = setTimeout(() => el.classList.remove('show'), 1000);
  }

  /** The button advertises the view you'd switch TO. */
  setViewLabel(currentMode: 'rail' | 'overhead') {
    document.getElementById('viewBtn')!.textContent =
      currentMode === 'overhead' ? 'RAIL VIEW' : 'TOP VIEW';
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

  /** Roll-history strip: sevens red, made points green, newest highlighted. */
  setHistory(items: Array<{ t: number; kind: 'seven' | 'point' | 'normal' }>) {
    document.getElementById('history')!.innerHTML = items
      .map(
        (i) =>
          `<span class="h${i.kind === 'seven' ? ' seven' : i.kind === 'point' ? ' point' : ''}">${i.t}</span>`,
      )
      .join('');
  }

  setBankroll(bankroll: number, onTable: number) {
    this.bankrollEl.textContent = fmt(bankroll);
    this.onTableEl.textContent = fmt(onTable);
  }

  /** Result line, with the two rolled faces drawn as mini dice so the
   *  numbers are always readable regardless of camera distance. */
  setResult(text: string, dice?: [number, number]) {
    if (!text) {
      this.resultEl.innerHTML = '';
      return;
    }
    const icons = dice ? dice.map((n) => Hud.dieSvg(n)).join('') : '';
    this.resultEl.innerHTML = `${icons}<span>${text}</span>`;
  }

  private static dieSvg(n: number): string {
    const off = 27;
    const c = 50;
    const spots: Record<number, Array<[number, number]>> = {
      1: [[c, c]],
      2: [
        [c - off, c - off],
        [c + off, c + off],
      ],
      3: [
        [c - off, c - off],
        [c, c],
        [c + off, c + off],
      ],
      4: [
        [c - off, c - off],
        [c + off, c - off],
        [c - off, c + off],
        [c + off, c + off],
      ],
      5: [
        [c - off, c - off],
        [c + off, c - off],
        [c, c],
        [c - off, c + off],
        [c + off, c + off],
      ],
      6: [
        [c - off, c - off],
        [c + off, c - off],
        [c - off, c],
        [c + off, c],
        [c - off, c + off],
        [c + off, c + off],
      ],
    };
    const dots = (spots[n] ?? [])
      .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9.5" fill="#f7f3e6"/>`)
      .join('');
    return `<svg class="dr" viewBox="0 0 100 100" aria-label="die ${n}">
      <rect x="4" y="4" width="92" height="92" rx="20" fill="#c33a2c" stroke="#7e1f18" stroke-width="4"/>${dots}</svg>`;
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
