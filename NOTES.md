# NOTES — rule decisions & assumptions

Audit trail of every call I made that the prompt didn't fully pin down.
Engine code: `src/engine/` (pure TypeScript, zero rendering dependencies).

## Phase log

- **Phase 1 (engine)** — complete. `state.ts`, `payouts.ts`, `resolve.ts`, `rng.ts`,
  plus `resolve.test.ts` (rules) and `montecarlo.test.ts` (1M-roll edge checks,
  report written to `edge-report.txt`). Adversarially reviewed by a multi-agent
  pass before the gate.

- **Phase 2 (dice)** — complete. Three.js scene (`src/scene/`), headless
  cannon-es pre-roll solver (`src/dice/`), crypto-drawn targets replayed from
  recorded trajectories. Adversarially reviewed before the gate.

## Phase 2 decisions

- **Pre-roll integrity**: the face pair is drawn from `crypto.getRandomValues`
  before any physics. The solver searches randomized launches until a throw
  settles cleanly on that exact pair (either die order — trajectories are
  swapped so die A shows target[0]). Physics never decides the roll, so the
  displayed distribution is exactly the crypto draw's.
- **Valid-throw rules enforced by the solver**: both dice must contact the far
  wall (geometric contact-plane check — cannon collide events proved unreliable
  for brief bouncy contacts), settle flat (≤ ~1.8° tilt) at felt height inside
  the rails, and rest within 0.5 m of each other (real throws cluster; also
  keeps the settle close-up tight). Cocked/stacked/off-table results are
  impossible by construction — invalid attempts are simply rejected.
- **Both dice share one throw velocity** (thrown from one hand) with small
  per-die jitter; independent orientations and spins. This is what makes both
  dice reach the back wall like a real throw.
- **Solver runs in 3 racing Web Workers** on independent seeds; first clean
  trajectory wins, losers are terminated and respawned. Measured: median
  ~350 ms single-threaded, typical 120-800 ms with the race; the UI never
  blocks. If every batch fails (never observed), the client reseeds and
  retries, then surfaces an error.
- **Trajectories are recorded at 120 Hz** during the solve and replayed with
  lerp/slerp interpolation — replay cannot diverge from the solved result, and
  no snapping is needed: validated settles are already visually flat (< 1.8°).
- **Dice are 25 mm** (slightly over the 21 mm casino spec) for readability at
  rail distance; sharp-edged like real precision dice. Table felt play area is
  2.6 m x 1.3 m.
- **Face layout**: 1 up, 2 toward player, 3 right (standard western
  right-handed die; opposite faces sum to 7). BoxGeometry material order
  [+X,-X,+Y,-Y,+Z,-Z] carries faces [3,4,1,6,2,5] to match.
- **Settle close-up**: after the dice rest, the camera eases toward them
  (viewing distance scales with dice separation) and eases back on the next
  roll. Dice teleport to the launch position at throw start — a pick-up/shake
  animation is deferred to Phase 5 polish, as is depth of field.
- The fairness line (seed, attempts, solve time) is shown under the table for
  now; the full fairness panel with distribution histogram arrives in Phase 5.
- **Phase 2 adversarial review outcome**: the statistical path was verified
  sound (no bias found — pre-drawn target, face-independent cleanliness
  filters, correct swap acceptance incl. doubles, target-independent seeds).
  One confirmed defect was fixed: workers that error or fail to load now
  settle the race (onerror/onmessageerror + worker try/catch) instead of
  soft-locking the ROLL button. Two minor unverified findings were also fixed:
  camera drag now tracks a single pointerId (second touch no longer jolts the
  view), and devicePixelRatio is re-read on resize.

- **Phase 3 (betting UI)** — complete. Printed layout, clickable regions,
  instanced chip stacks, chip rail, remove mode, bankroll display.

## Phase 3 decisions

- **Layout**: a clean single-end layout (one player, so no mirrored second
  end): number boxes 4/5/SIX/8/NINE/10 across the far side with LAY and BUY
  bands inside the 4 and 10 boxes, Don't Come box far-left, then FIELD, COME,
  BIG 6/8, DON'T PASS BAR (with a marked odds sub-box), PASS LINE with a
  dashed ODDS strip behind it, and a proposition block (hardways + one-roll
  bets + horn + C&E) on the right near the shooter. All art is drawn
  procedurally onto a 1 px/mm canvas — no external assets.
- **Regions and art share one source of truth** (`layout.ts` region rects
  drive both the texture painter and the raycast hit-tester), so a printed
  box can never disagree with its clickable area.
- **Chip-level removal** is a new pure engine function `reduceBet` — removes
  up to the active denomination, clamps to the bet, enforces the same
  contract-bet locks as full take-down. Right-click and remove-mode left-click
  both use it.
- **Chips**: instanced meshes (one InstancedMesh per denomination), greedy
  decomposition largest-at-bottom, deterministic per-bet jitter, overflow
  columns fan out sideways after 14 chips. Discovered along the way:
  InstancedMesh + material-group arrays silently renders nothing in the color
  pass (shadows still draw), so each chip uses a single-material texture atlas
  (face + edge stripes) with remapped cylinder UVs.
- **Click vs drag**: pointer movement under ~6 px on release is a bet click;
  beyond ~7 px the camera drag engages. Right-click (or remove mode) removes.
  Invalid bets toast the engine's exact validation message.
- **Phase separation**: rolling works but bets do not resolve yet — the point
  never establishes, so point-dependent bets (come/don't come, odds) correctly
  refuse with a toast until Phase 4 wires resolution.
- **Phase 3 adversarial review outcome** (10 findings raised, all addressed):
  - *Critical*: the proposition block originally sat at x 0.74–1.26 — outside
    the rail camera's reachable view entirely (verified numerically). Fixed by
    moving the block to x 0.16–0.68 below the numbers row, shifting the base
    look target right, and widening the yaw arc to ±0.72 rad; a projection
    scan now proves every region corner reachable at every aspect ratio.
  - *Major*: an out-and-back drag could both steer the camera AND place a bet
    (picker judged net displacement, camera judged max displacement). The
    picker now latches "exceeded slop" during the gesture, shares one
    threshold constant with the camera, tracks a single pointerId, resets
    state on pointerup/cancel, and ignores clicks while the camera push-in is
    animating.
  - *Minor*: `reduceBet('dontPass')` taking the whole flat now also returns
    the lay odds (takeDownBet parity); chips after a display-capped
    denomination no longer float at gapped stack levels.

- **Phase 4 (wiring)** — complete. Engine drives everything: rolls resolve,
  puck moves, win breakdown + session totals display, keep toggle live.

## Phase 4 decisions

- **Resolution flow**: when the replay settles, the pre-drawn crypto faces are
  fed to the engine's `resolve()` — the same faces the dice show. The engine
  owns all money movement; the UI only renders the returned state and the
  per-bet resolution records.
- **Win display**: roll total + event line ("point is 6", "seven out",
  "yo — winner"...), a colored net for the roll, a per-bet breakdown card
  (wins show net winnings, losses lost stake, pushes/returns/travels
  labeled), and a running session line (wagered counts each resolved stake
  once — pushes included, matching the house-edge convention; net =
  winnings − losses).
- **Resolution flashes**: each resolved bet's region flashes green (win),
  red (loss), amber (push/return), or blue (travel) for ~1.4 s.
- **Puck**: procedural ON/OFF puck slides to the point's box (top-right
  corner, clear of all chip anchors) and flips back to its OFF corner when
  the hand ends.
- **Come/Don't Come odds UI**: while a traveled point is up, an invisible
  click zone appears over its chip stacks — clicking adds odds behind it
  (take for come, lay for don't come). Hover tooltips make it discoverable.
- **"No more bets"**: betting is frozen from the roll click until resolution
  completes, closing the watch-the-dice-settle-then-bet exploit.
- **Close-up dismissal**: any click/drag while pushed in on the dice returns
  to the rail view; the dismissing click cannot place a bet (clicks are
  suppressed while the camera animates).
- Session totals are UI-level (reset on reload) until Phase 5 adds
  localStorage persistence alongside bankroll and settings.
- **Phase 4 adversarial review outcome**: two confirmed findings (one root
  cause) fixed — click suppression was sampled at pointerup, so a long-press
  begun while the camera was pushed in could outlive the return blend and
  place a bet on an unaimed region. Suppression is now LATCHED at
  pointerdown, and the predicate covers off-rail camera, blend animation, and
  the entire rolling/replay window. A refuted-but-useful robustness note was
  also applied: playback clears before resolution runs and the roll button
  re-enables in a `finally`, so a hypothetical exception can never
  double-resolve a roll or soft-lock the game.

- **Phase 5 (audio + polish)** — complete. Synthesized audio, DOF, stats +
  fairness panel, settings with persistence.

## Phase 5 decisions

- **Audio is 100% synthesized** (Web Audio API): dice impacts are extracted
  from the recorded trajectory as delta-v spikes (pure, unit-tested module) —
  felt thuds, wall knocks, and die-on-die clacks with intensity from the
  actual collision speed, plus a low rolling noise that follows surface
  speed. A chip click on place/remove, and a win chime whose note count and
  level scale with the payout. Nothing else — no music, ambience, or voice,
  per spec. AudioContext unlocks on the first gesture (autoplay policy).
- **Persistence**: bankroll, settings (incl. odds policy up to 100x),
  sound/DOF prefs, stats, and session totals save to localStorage on every
  change and on unload. Live bets are folded back into the bankroll at save
  time, so a reload returns working bets to the stack — money can never be
  lost to a refresh. Corrupt/missing saves fall back to defaults.
- **Stats/fairness panel**: per-total histogram with the exact 36-outcome
  expectation marked, handle, net, realized house edge (−net/handle),
  per-bet-type W–L records (pushes shown, travels/returns excluded), and a
  log of recent rolls with their solver seeds.
- **Settings panel**: keep-winnings, place/buy-on-come-out, hardways-on-
  come-out, come-odds-on-come-out, max odds (3-4-5x default; 2x/5x/10x/100x),
  sound, depth of field, bankroll reset, stats reset.
- **Depth of field**: subtle bokeh via EffectComposer (Render→Bokeh→Output);
  the focal plane eases to the settle close-up distance and back. Toggleable;
  121 fps measured with it on. Found along the way: without an OutputPass the
  composer skips tone mapping + sRGB and the scene renders dark — fixed.
- **Pre-roll pickup**: dice now slide from their rest position to the launch
  point with a small arc before each throw (no more teleport).
- **No session timeout — verified**: the only timers in the app are the toast
  auto-hide and audio scheduling; there is no idle detection, no expiry, no
  forced break, and the persistence layer never expires.
- **Phase 5 review outcome**: the review's verifier stage was cut short by an
  API rate limit, so I evaluated all 11 raised findings by hand — all were
  real and all are fixed: two boot-brick paths from malformed saves (the
  loader now shape-normalizes every field with per-field fallbacks — proven
  in-browser against the exact malformed fixtures), an oddsPolicy shape hole
  that would have silently produced an unlimited odds cap, rolling audio
  droning forever in hidden tabs (visibilitychange now silences it),
  keyboard-only users never unlocking audio (keydown now unlocks), bankroll
  reset racing an in-flight roll (now blocked), stats-clear leaving the
  fairness-log numbering unsynced, phantom all-zero stat rows from
  travel/return resolutions, and the histogram's expectation marker clipping.
  The scene and spec-audit lenses also died to the rate limit; I ran both
  checklists manually — the scene pass surfaced two real fixes (composer
  pixel-ratio on resize, PMREM generator disposal), and the spec walk found
  everything present, with these conscious deviations on record: wood rather
  than brushed-metal chip rail, 25 mm dice, single-end layout, and buy
  commission charged on the win.

## Final spec compliance (audited by hand at the last gate)

Every hard requirement is implemented and verified: no timeout of any kind;
chip denominations/colors and place/remove interactions; keep-winnings toggle
(default ON, contract vs standing semantics); physical dice thrown from the
near-right that must strike the far wall, opposite faces summing to 7, with a
visible rest close-up; a static table where only dice, puck, and chips (plus
brief resolution flashes and the player's own camera) ever move; synthesized
audio limited to dice, chip click, and payout-scaled wins; per-roll win
readout with per-bet breakdown and session totals; crypto pre-roll with
physics replay and a fairness panel (seeds + distribution vs expectation);
stats panel with handle/net/realized edge and per-bet records; 3-4-5x default
odds with a 100x option; localStorage persistence of bankroll/settings/stats;
instanced chips; 121 fps measured with depth of field enabled.

## Post-release polish (user-requested)

- **Overhead betting view**: the default view is now directly above the table
  with the whole layout visible (height auto-fits the felt at any aspect
  ratio). Pressing ROLL flies down to the first-person rail for the throw and
  the settle close-up; dismissing the close-up returns to your preferred
  view. A RAIL VIEW / TOP VIEW button switches anytime and the preference
  persists. Drag-look only exists at the rail (nothing to aim overhead).
- **Ctrl+click removes chips** (cmd+click on Mac; macOS ctrl+click arrives as
  a right-click and was already handled). Right-click and the REMOVE toggle
  still work.
- **Vegas-style layout restyle**: pass line now wraps the end of the lanes
  with a rounded corner and a vertical PASS LINE segment (extra clickable
  alias region), double-line box borders throughout, condensed stretched
  lettering, gold-circled field 2/12 with DOUBLE/TRIPLE, diamond dividers and
  apron diamonds, red prop lettering with "PAYS X TO 1" phrasing, and C & E
  circles. Same regions/art single source of truth; all payouts unchanged.
- **Toolchain note**: late in development, macOS folder protection began
  intermittently blocking spawned node/git processes inside ~/Documents
  (getcwd EPERM). Builds/tests/commits run from a mirrored workspace in /tmp,
  synced from the canonical files in the project directory.

## Round 13 — sharpness, drag-off, dice in sight (user-requested)

- **Sharper on phones**: render resolution now comes from a pixel *budget*
  (`min(devicePixelRatio, 2, sqrt(2.6e6 / cssPixels))`) instead of a flat 1.5×
  cap, so a small viewport spends its budget on sharpness — an iPhone goes
  1.5× → 2× (1864×860 at 932×430) while a desktop window stays at ~1.58×,
  the same 2.6 MP it drew before. The phone plan view also skips depth of
  field entirely (nothing to defocus looking straight down; it only softened
  the layout text and cost two post passes).
- **Dock chips no longer sheared**: `overflow-x: auto` clips vertically too,
  so the raised selected chip lost its top — the rail carries 9px of top
  padding inside the scroll box.
- **Drag a chip off a stack to remove it** (touch equivalent of ctrl+click):
  a press that travels 22px off the stack it started on pulls one chip of
  the selected denomination — $35 with $5 up drops to $30. The threshold sits
  well above the 6px click slop, the region is captured at pointerdown, it
  fires once per gesture, ignores bare felt, and is disabled at the rail
  where a drag steers the camera.
- **Adversarial review fixes** (2 critical, caught before shipping):
  (a) the pixel budget had no lower bound, so any viewport past 2.6 MP drew a
  buffer *smaller* than its own CSS box and let the browser upscale it —
  measured 0.84× at 2560×1440, i.e. this "sharpness" change made big screens
  blurrier than the flat cap it replaced. The budget now only ever raises the
  ratio (floored at the old `min(dpr, 1.5)`), verified across real resizes:
  2.0 at 932×430, 1.59 at 1280×800, 1.50 at 1600×1000, never upscaled.
  (b) drag-off committed the removal from `pointermove`, so money left the
  table mid-gesture with no way back — and an iOS `pointercancel` (edge
  swipe, palm, incoming call) took the chip anyway. It now *arms* on the move
  and only cashes on release, through the same guards a click uses, and
  dropping the chip back on its stack cancels it.
- **Dice always land in sight**: the solver's rest zone gained `restMinX`
  (−1.16, off the far wall) and `restMaxAbsZ` (0.5 — the dock's top edge
  projects to z ≈ 0.54, so this keeps a die's width of margin). Measured
  before: 6 of 40 settles hidden under the dock, max screen-y 409 against a
  dock top of 377. After: 0 of 40, max 314. Costs ~7% median solve time
  (210 ms vs 197 ms single-threaded; the 3-worker race absorbs it).

## Round 12 — phone HUD: corners + readable chips (user-requested)

- **Dock hugs the bottom**: the phone rail drops its safe-area padding and
  sits 2px + half the inset off the bottom edge (taps beside the home
  indicator still land); bank pills and ROLL lowered to match.
- **STATS/SETTINGS top-right**, row layout, on phones and narrow windows.
- **Vertical roll history**: on short screens the strip becomes a right-edge
  column — newest at top with the gold ring, capped at 14 so it clears the
  corner ROLL; `setHistory` reverses/slices under a `matchMedia` check and
  re-renders on resize, so rotation restores the horizontal strip.
- **Readable on-table chips**: the phone plan view renders 3D chip stacks at
  1.6× (`ChipRenderer.setScale` — scales chip instances, stack heights,
  column fan-out, and the pooled total discs; re-applied per render since
  discs are reused across scale changes). Wired in `applyView`, overhead
  mode only, so the rail view keeps true-size chips.
- **Payout column** shifts 24px left on phones to leave the right edge to
  the history column.
- **Adversarial review fixes** (4 confirmed by the review workflow):
  (a) the top-right STATS/SETTINGS sit inside the open panel's footprint —
  raised above it (z-index 8) so they keep working as toggles, panel content
  padded down; (b) narrow-but-tall windows drop the horizontal history strip
  below the relocated buttons; (c) history re-renders on the media-query
  `change` event, not just `resize` (stale during iOS rotation); (d) scaled
  chips merged traveled come/don't-come flats with their odds — pair anchors
  now respread with the chip scale (identity at 1×) and the flat slides
  clear of the ON puck.

## Round 11 — phone fit: full-bleed zoom, smaller dock (user-requested)

- **Plan view zoomed to the felt**: the phone framing now fits the felt flush
  to the screen edges — walls and wood survive only as the sliver the aspect
  ratio leaves at the sides (fit half-extents: felt + wall + 1 cm wide, felt
  + 1.5 cm z-bias tall, 5 mm margin). Iterated twice on user screenshots.
- **Dock shrunk for phones**: 42 px chips, compact pills and buttons, 62 px
  ROLL in the bottom-right corner. The corner ROLL had been hijacked by the
  chip rail's `translateX(-50%)` — a transformed ancestor captures
  `position: fixed` children — so the rail now centers with
  `left/right insets + width: fit-content + margin: auto`, no transform.
- **Canvas sizing watchdog**: alongside the ResizeObserver and orientation
  re-checks, a visualViewport listener plus a 700 ms drift check against the
  container corrects any stale iOS viewport size — the view can't stay
  letterboxed after rotation or toolbar changes.

## Round 10 — landscape-only phones, plan view (user-requested)

- **Phones are landscape-only**: portrait on a touch device shows a
  full-screen "rotate to landscape" screen (side UI hidden — the fixed HUD
  creates a stacking context, so sibling overlays are hidden explicitly).
- **The phone view is a straight-down plan view** of the whole table — the
  table's ~1.9:1 footprint nearly matches a landscape phone, so it fills the
  screen edge-to-edge. Screens taller than 540 px keep the 64° lean-over
  view; the camera swaps automatically on resize/rotation.
- **iOS rotation bug fixed**: the classic resize event reports stale
  dimensions on iOS, which had been framing the camera for the wrong
  viewport (the reported broken screenshot). Sizing now runs through a
  ResizeObserver plus a delayed orientation-change re-check.
- **Phone HUD**: everything hugs the edges — STATS/SETTINGS tiny top-left
  row, history top-center, balance/total-bet pills bottom-left, one
  scrollable dock row bottom-center, ROLL pinned bottom-right; the fairness
  and session lines hide, the payout column compresses and lifts clear of
  ROLL.

## Round 9 — Gus Bus recipe, iPhone support, published (user-requested)

- **Gus Bus finalized**: $25 on the 5 and 9, $35 on the 6 and 8 ($120 inside).
  Saves whose slot 1 still carries the stock name receive the new recipe;
  renamed slots stay untouched.
- **iPhone/mobile pass**: viewport locked (no pinch-zoom, viewport-fit=cover),
  safe-area insets on the dock and pills, touch-action manipulation on all
  controls (no double-tap zoom or tap delay), compact one-row scrollable dock
  with the ROLL button pinned bottom-right on phones (portrait or landscape),
  shrunken history/payout column for short screens, and a "rotate your phone"
  hint in portrait. Media queries moved after base rules (a cascade-order bug
  had been silently disabling the compact ROLL placement). Audio unlocks on
  first touch; pixel-ratio cap keeps iPhone GPUs comfortable.
- **Published to GitHub Pages**: built with --base=/craps-sim/ and deployed
  from the gh-pages branch. Live at
  https://bargus02-lab.github.io/craps-sim/ — verified end-to-end on the
  deployed build (boot, presets, solver workers, rolls).

## Round 8 — dice visibility + history points (user-requested)

- **Dice never leave the frame**: the solver now rejects any settle right of
  x = 0.78 (the framed view's right edge) and the launch point moved inside
  the frame — verified over 24 live rolls (max rest x 0.38). Median solve
  cost stays ~290 ms single-threaded across all targets.
- **Readable roll faces**: the result line draws the two rolled faces as red
  mini-dice icons next to the total, so the numbers are legible regardless of
  camera distance.
- **History strip**: a made point lights its bubble green (persisted via a
  `pm` flag on the roll log), joining the red sevens.

## Round 7 — chip styling + HUD polish (user-requested)

- **Stack-total discs inverted**: the disc is now the chip's own color with a
  white ring and white number ($25 stack → green disc, white "25"); the
  near-white $1 keeps dark ink.
- **Dock chips match the table chips**: colored face with accent edge spots
  (conic-gradient) and a solid center — the same design as the 3D chips.
- **ROLL button**: gold ring + inner dashed ring over deep felt green, a
  slow pulsing gold glow (faster on hover), scales up on hover and squishes
  on press.
- **TOTAL BET pill** shows just the amount ("$90"), no prefix text.
- **HARDWAYS / ONE ROLL pill headers** are now fully opaque.

## Round 6 — lay-odds fix + performance (user-requested)

- **Don't pass odds bug fixed**: $25 don't pass at point 4 previously allowed
  a $300 lay (the code capped the potential WIN at 6× flat). The standard
  3-4-5x rule caps the LAY AMOUNT at 6× the flat — $150 max on $25, winning
  $75 on the 4 — mirroring the 3x/4x/5x take schedule. Applied to don't pass
  and don't come odds; the exact reported scenario is now a regression test,
  and flat-N× games keep the lay-to-win-N× convention (verified: 100x on the
  4 allows laying 200x).
- **Performance pass**: renderer pixel ratio capped at 1.5 (≈44% fewer
  fragments on Retina vs the old 2.0 cap), `powerPreference:
  'high-performance'`, depth of field now OFF by default (it was the most
  expensive effect; a one-time migration turns it off for existing saves,
  after which the settings toggle is respected), hover raycasts throttled to
  60 Hz against high-report-rate mice, and solver workers are now reused
  between rolls (only busy losers are terminated) instead of respawning all
  three every throw.

## Round 5 — premium pass (user-requested)

- **Pyramid-rubber walls**: the inner walls (including the far wall the dice
  strike) now wear a procedural studded texture with bump mapping — the
  classic diamond rubber. Long and short walls use matched stud densities.
- **Richer wood**: deeper mahogany gradient with light/dark grain streaks,
  glossier finish, environment sheen.
- **Layout art v3**: rounded two-tone cells throughout, brighter saturated
  teal felt, white serif numerals, gold serif COME, tone-on-tone PASS LINE,
  softened red barred lettering, arc-captioned field circles — the premium
  Strip idiom.
- **Dice up to 38 mm.** The audio impact classifier became die-size aware,
  and wall proximity now outranks die-proximity when both dice bang the back
  wall together (that sound is the wall, not a chip-clack).
- **Stack totals on the top chip**: every stack's top chip carries a white
  inset disc with the stack's total in the top chip's color — exactly the
  dealer-lammer look from the reference. Disc textures are cached per
  (value, color).
- **HUD**: green-ringed glowing ROLL, MY-NUMBERS-style payout column with
  green/red number circles. Depth-of-field focus now re-syncs on window
  resize (it previously went blurry when the aspect changed the camera
  distance) and the bokeh was softened.

## Round 4 refinements (user-requested)

- **Big 6 / Big 8 removed from the layout** (the engine still knows the bet;
  there is simply no spot for it). The don't-pass band absorbed the space.
- **All camera motion removed from the roll cycle**: no fly-to-rail on ROLL,
  no settle close-up, no zoom-back. The view stays exactly where you put it
  so betting resumes instantly; RAIL VIEW remains as a manual toggle.
- **Stack total labels removed**; instead chips grew to 64 mm and the roll
  total flashes huge in the center of the screen for one second (red on a 7).
- **Bigger dock**: 82 px chip buttons, 108 px round ROLL, larger pills.
- **Presets**: ten savable betting layouts behind a PRESETS button — BET
  places a layout in one click (skipping anything currently illegal, with a
  toast), SAVE captures your current placeable bets into a slot, ✎ renames.
  Persisted with everything else. Slot 1 ships as **"Gus Bus"** — a $90
  inside spread (6/8 for $30, 5/9 for $10, hard 6/8 for $5) as a starting
  point; overwrite it with SAVE to make it the real Gus Bus if yours differs.
  Traveled come/don't-come points are not capturable (they can't be
  re-placed directly, per the rules).
- **Hidden-tab fast-forward**: rAF pauses in background tabs, which used to
  freeze a mid-flight replay; now backgrounding the tab immediately resolves
  the roll (silently), so the game state never hangs in the air.
- Verified end-to-end: the payout column predicted "9 +$14" with the Gus Bus
  spread up, the 9 rolled, and it paid exactly +$14; the easy-6 row correctly
  netted the hardway loss (+$30 easy / +$80 hard).

## Round 3 refinements (user-requested)

- **Auto zoom-back**: the settle close-up holds ~2.4 s and then returns to the
  betting view on its own; any interaction dismisses it sooner.
- **Bigger pieces**: dice 30 mm, chips 54 mm — sized for the plan view.
- **$50 chip removed**: denominations are now 1 / 5 / 25 / 100.
- **Payout column**: the on-table tags were replaced by a vertical "IF IT
  ROLLS" column on the right edge — every total 2–12 with the NET result of
  the next roll, computed by running the actual engine resolve() against the
  live state (so it honestly reflects come-out rules, working toggles, odds,
  everything). Hard totals show a separate value when a hardway bet makes the
  hard/easy outcome differ. Sevens circled red, Evolution-style.
- **Stacks**: chips re-sort smallest-at-bottom (a red $5 added to a green $25
  slides underneath), and every stack carries a floating total label above it
  ("$30"). Labels hide while the dice roll.
- **Upright numbers**: chip denominations and the puck lettering now keep a
  fixed orientation facing the player (only a slight wobble), so every number
  on the table reads upright from the point of view.

## Main-view refinements (user-requested)

- The mirrored second end was removed again — single-end table only — and the
  main view now frames just the active half (x ≈ −1.3..0.7) at a tighter
  distance, letting the rail crop top/bottom like the reference presentation.
- The REMOVE button and remove-mode are gone: **ctrl+click** (cmd+click on
  Mac, right-click also works) is the removal gesture. Hovering a live bet
  shows "$X riding · ctrl+click removes".
- Roll-history strip now shows the last 20 totals.
- **Payout tags**: whenever a number has money on it (place, buy, or a
  traveled come point with odds), a floating gold tag under that column shows
  exactly what lands in your stack if the number rolls — e.g. "6 pays
  $29.17" for $25 place at 7:6, "4 pays $48.75" for $25 buy at 2:1 less the
  5% win commission. Tags hide while the dice are rolling.

## Strip-style main view (user-requested, post-release)

- **Main view**: the default betting view is now a gently tilted plan view
  (64° elevation) framing the whole table with the wood rail — the classic
  online-craps presentation. Distance auto-fits any aspect ratio. The throw
  still plays from the first-person rail, and RAIL VIEW remains a toggle.
- **Layout rebuilt in the modern Strip idiom** (all original code-drawn art):
  deep teal felt, white serif numerals, a LOSE row (lay) above the numbers
  and a WIN row (place) below, tone-on-tone COME, FIELD with white-circled 2
  (PAYS DOUBLE) and 12 (PAYS TRIPLE) captioned in arced text, barred/faded
  DON'T COME box, red DON'T PASS with dice icons plus a vertical segment
  inside the gold PASS LINE wrap, HARDWAYS/ONE ROLL pill headers with red
  hardway dice and white one-roll dice, SEVEN 4:1 / CRAPS 7:1, C·E and HORN,
  and a partial mirrored second end on the right (clickable — maps to the
  same bets; chips stack on the primary end). LOSE cells on 5/6/8/9 explain
  via toast that the engine offers lay on 4/10 only (per the original spec).
  Engine payouts unchanged; 12 still pays triple in the field per spec even
  though some Strip tables pay double.
- **Roll-history strip** across the top (last 14 totals, sevens in red),
  BALANCE / TOTAL BET gold pills, circular ROLL button, procedural mahogany
  wood grain on a wider rail, chips slightly over real size for plan-view
  legibility.

## Rule decisions

1. **Buy 4/10 commission** — spec says "2:1 less 5% commission" without timing.
   Implemented as 5% **of the bet, charged only on a win** (modern practice;
   matches the spirit of the lay wording). Win on $20 buy = $39.
2. **Lay 4/10 commission** — per spec: 5% **of the win**, on the win only.
   Win on $40 lay = $19.
3. **Buy bets follow the Place working rule** (off on the come-out by default,
   same `placeWorkingOnComeOut` toggle). **Lay bets are always working**
   (standard for don't-side bets), as are Big 6/8, Field, and all one-roll props.
4. **Bar-12 push** (Don't Pass / Don't Come): no money moves and the bet stays
   standing, regardless of the keep-bets toggle. That matches physical table
   behavior — a barred 12 doesn't take the bet down.
5. **Contract re-placement with keep ON**: a won Pass/Don't Pass flat simply
   stays up for the next come-out. A won Come/Don't Come **point** flat is
   re-placed as a fresh flat Come/Don't Come bet — and is queued so it cannot
   act on the roll that won it. This means a re-placed Come flat can exist on a
   come-out (normally not placeable there); it simply works as its own come-out,
   which is exactly the contract-bet rule the spec requires for carried flats.
6. **Odds never stay up.** When a flat wins with keep ON, the flat stays but
   odds principal + odds winnings always return to the bankroll (there is no
   point for them to attach to until the next roll establishes one).
7. **Come odds "off on the come-out"** means *returned* — if the come point hits
   or a 7 rolls on a come-out, the flat resolves and the odds are given back,
   neither won nor lost. Togglable via `comeOddsWorkingOnComeOut`. Don't Come
   odds are always working (not togglable), per spec.
8. **Don't-side odds caps** (corrected in Round 6 after a user bug report):
   under 3-4-5x the don't side may lay up to **6× the flat bet** on any point,
   winning 3x/4x/5x the flat by point — the mirror of the take schedule. A
   flat `N×` policy caps the potential win at N× the flat (lay up to 2N× on
   the 4/10). Take-side caps are per-point multiples.
9. **"Keep winning bets" for one-roll bets** (Field, props): the spec lists
   props under standing bets, so on a win the original wager stays working for
   the next roll and only net winnings are paid. On a loss it comes down.
10. **Horn** accepts any amount and splits it into four equal parts (2/3/11/12);
    winnings are reported **net** of the three losing quarters ($4 horn on 12 →
    +$27). Real tables want multiples of 4 — the Phase 3 UI will nudge that, but
    the engine doesn't reject other amounts. **C&E** likewise splits in half
    (craps half at 7:1, yo half at 15:1), reported net.
11. **Big 6/8 are always working** (self-service bets), including on the
    come-out — a come-out 7 takes them down.
12. **Put bets are not supported**: Pass/Don't Pass can only be placed on the
    come-out; Come/Don't Come only with a point up. Don't Pass may be taken
    down at any time (legal, though player-unfavorable); Pass with a point up is
    locked. Don't Come point flats are removable via `takeDownDontComePoint`.
13. **Money is plain floating-point dollars** inside the engine — fractional
    payouts (7:6 place, odd odds) are paid exactly, per the spec's "no cap on
    display precision". The UI will round *display* to cents; sums stay exact to
    double precision. No rounding happens in the engine.
14. **RNG**: real rolls are two independent `crypto.getRandomValues` draws with
    rejection sampling (reject bytes ≥ 252, then %6) — provably uniform. The
    seeded mulberry32 PRNG exists only for the deterministic test simulations
    and (in Phase 2) the physics replay solver; it never generates a real roll.

15. **Known test limitation** (flagged by the adversarial review): the crypto
    RNG uniformity test is a smoke check — it is not statistically powered to
    detect a subtle modulo bias if the rejection sampling were ever removed.
    Uniformity is guaranteed *by construction* (reject bytes ≥ 252, then %6);
    the Phase 5 fairness panel will additionally chi-square the real roll
    history so bias would be visible in play.

## House-edge conventions used by the tests

- Edge = −net / handle, where a bet's stake enters handle once per resolution.
- Bar-12 pushes count as resolutions for Don't Pass — that's what makes the
  standard 1.36% figure (vs. 1.40% excluding pushes).
- A Come bet counts once per lifecycle: either its instant flat resolution or
  its come-point resolution; the travel itself is not a resolution.
- Simulation seeds are fixed, so measured edges are deterministic run-to-run.
