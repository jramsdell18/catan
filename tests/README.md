# Testing guide

This project has three kinds of automated checks:

| Layer | Tool | What it proves | Speed |
|-------|------|----------------|-------|
| **Unit (rules + adapters)** | [Vitest](https://vitest.dev/) | Game rules and pure JS glue between UI data and the engine | ~1s |
| **Board generation** | Node’s built-in test runner | Random island terrain/tokens (and a related Vitest suite) | ~1s |
| **End-to-end UI** | [Playwright](https://playwright.dev/) | Browser UI + 3D scene smoke, lobby/setup/turn flow | ~1 min |

Rules logic is pure JavaScript (no React/Three). Prefer unit tests for bugfixes there. Use Playwright for “button → status text → phase” bugs.

---

## Quick start

```bash
npm install

# Everything (unit + board node test + Playwright)
npm run test:all

# Same checks GitHub Actions runs (unit + board + build + e2e)
npm run test:ci

# Fast feedback while coding
npm run test:watch
```

First-time Playwright browsers (if needed):

```bash
npx playwright install
# On Linux CI images, use:
# npx playwright install --with-deps chromium
```

---

## Continuous integration (GitHub Actions)

Workflow file: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)

| When | What runs |
|------|-----------|
| **Pull request → `main`** | Unit tests, production build, Playwright e2e |
| **Push to `main`** | Same checks (confirms the merged tree is green) |

Jobs run **in parallel** where possible:

1. **Unit tests** — `npm test` + `npm run test:rules`
2. **Production build** — `npm run build`
3. **Playwright e2e** — install Chromium, then `npm run test:e2e` with `CI=true`

### Do we run CI before merging to main?

**Yes — that is the intended gate.** On GitHub:

1. Open a PR into `main` (or push a branch and open a PR).
2. Wait for the **CI** workflow to finish green.
3. Merge only after checks pass.

Optional but recommended: **Settings → Branches → Branch protection** on `main`:

- Require a pull request before merging
- Require status checks to pass: `Unit tests`, `Production build`, `Playwright e2e`

Direct pushes to `main` still *run* CI (so you see failures), but only branch protection *blocks* merge of red PRs. Prefer PRs for anything non-trivial.

Locally, mirror CI before you open a PR:

```bash
npm run test:ci
```

---

## npm scripts

| Command | Runs |
|---------|------|
| `npm run test` | All Vitest unit tests (`tests/rules/**`, `tests/game/**`) |
| `npm run test:watch` | Vitest in watch mode (re-runs on save) |
| `npm run test:unit:rules` | Only rules-engine unit tests |
| `npm run test:unit:game` | Only UI↔rules adapter / board helper unit tests |
| `npm run test:rules` | Node `board-rules` check (number tokens / 6–8 adjacency) |
| `npm run test:e2e` | All Playwright specs (`*.spec.js`) |
| `npm run test:e2e:flow` | UI game-flow specs only |
| `npm run test:render` | 3D canvas smoke only |
| `npm run test:all` | `test` + `test:rules` + `test:e2e` |
| `npm run test:ci` | Full CI mirror: unit + board-rules + build + e2e |

---

## Layout

```text
tests/
  README.md                 ← this file

  rules/                    ← Vitest: pure rules engine (src/rules/)
    fixtures.js             shared board, players, setup helpers
    board.test.js           createBoard, distance rule, ports
    game.test.js            createGame, applyAction, phases
    scoring.test.js         longest road, largest army, win

  game/                     ← Vitest: visual board + adapters (src/game/)
    board.test.js           terrain/token distribution, ports
    topology.test.js        vertices/edges graph
    rulesAdapter.test.js    createRulesBoard, placements, hands
    setupFlow.test.js       setup snake order helpers
    pieces.test.js          colors, inventories
    resources.test.js       legacy starting-card helper
    integration.test.js     full board → rules setup snake

  board-rules.test.js       ← node:test (also covered partly in game/board.test.js)

  three-render.spec.js      ← Playwright: non-blank 3D canvas
  game-flow.spec.js         ← Playwright: lobby, setup, roll, end turn
```

### Naming conventions

| Pattern | Runner | Purpose |
|---------|--------|---------|
| `**/*.test.js` under `rules/` or `game/` | Vitest | Unit tests |
| `board-rules.test.js` at `tests/` root | `node --test` | Standalone board check (kept out of Vitest on purpose) |
| `**/*.spec.js` | Playwright | Browser e2e |

Vitest is configured in `vite.config.js` to only pick up `tests/rules/**` and `tests/game/**`, so Playwright and node:test files are never mixed into the unit run.

---

## What each suite covers

### 1. Rules engine (`tests/rules/`)

**Source under test:** `src/rules/`

Authoritative Catan base-game state machine: `createBoard` → `createGame` → `applyAction`.

| File | Focus |
|------|--------|
| `board.test.js` | Board validation, adjacency, settlement/road legality, maritime port ratios |
| `game.test.js` | Setup snake, dice/production/robber/discard, build, dev cards, trade, win |
| `scoring.test.js` | Longest road, largest army, victory points, win-on-own-turn |
| `fixtures.js` | Fixed 16-vertex path board, 3/4-player setup plans, `giveResources` / `setPhase` helpers |

**Not covered here:** React, Three.js, network multiplayer.

### 2. Game adapters (`tests/game/`)

**Source under test:** `src/game/`, plus wiring into `src/rules/`

| File | Focus |
|------|--------|
| `board.test.js` | 19-hex island, terrain counts, no adjacent 6/8, ports |
| `topology.test.js` | 54 intersections / 72 paths, stable ids |
| `rulesAdapter.test.js` | Visual hexes → rules board; game state → UI placements/cards |
| `setupFlow.test.js` | Snake turn order UI helpers |
| `pieces.test.js` | Player seats and remaining piece counts |
| `resources.test.js` | Second-settlement starting cards helper |
| `integration.test.js` | End-to-end pure-JS path matching `App.jsx` setup |

### 3. Board rules (node)

**File:** `tests/board-rules.test.js`  
**Run with:** `npm run test:rules`

Seeded random board: 18 number tokens with official counts, no 7, red numbers (6/8) not adjacent.

### 4. Playwright e2e

| File | Focus |
|------|--------|
| `three-render.spec.js` | Desktop + mobile: WebGL canvas visible, non-blank screenshot |
| `game-flow.spec.js` | Set players → start game → setup snake → starting resources → roll → end turn; restart |

**Dev-only test API:** In `npm run dev`, the app exposes `window.__CATAN_TEST_API` so setup placements use the same handlers as 3D highlights (canvas raycasts are too brittle for CI). Production builds do not rely on this for gameplay.

**DOM hooks:** Prefer `data-testid` (e.g. `start-game`, `engine-phase`, `status-message`) over CSS class names.

---

## Running tests individually (debugging)

### Vitest — one file

```bash
# By path (preferred)
npx vitest run tests/rules/game.test.js
npx vitest run tests/game/topology.test.js

# Or via npm filter
npm run test -- tests/rules/game.test.js
```

### Vitest — one `describe` or `it` by name

```bash
# Substring match on test title
npx vitest run tests/rules/game.test.js -t "setup phase"
npx vitest run tests/rules/game.test.js -t "steals a random resource"

# Watch a single file while you edit
npx vitest tests/rules/scoring.test.js
```

### Vitest — only rules or only adapters

```bash
npm run test:unit:rules
npm run test:unit:game
```

### Node board-rules

```bash
npm run test:rules
# or
node --test tests/board-rules.test.js
```

### Playwright — one file

```bash
npm run test:e2e:flow
npm run test:render

# or
npx playwright test tests/game-flow.spec.js
npx playwright test tests/three-render.spec.js
```

### Playwright — one test by title

```bash
npx playwright test tests/game-flow.spec.js -g "Start Game stays disabled"
npx playwright test tests/game-flow.spec.js -g "completes setup"
```

### Playwright — headed / debug

```bash
# See the browser
npx playwright test tests/game-flow.spec.js --headed

# Step through with Playwright Inspector
npx playwright test tests/game-flow.spec.js --debug

# Slow motion
npx playwright test tests/game-flow.spec.js --headed --slow-mo=500
```

Playwright starts Vite on `http://127.0.0.1:5173` automatically (`playwright.config.js`). If you already have `npm run dev` running, it reuses that server.

### UI test API in the browser console

With `npm run dev` open:

```js
window.__CATAN_TEST_API.getState()
// { phase, currentPlayerId, settlementOptions, roadOptions, resources, ... }

window.__CATAN_TEST_API.placeSettlement('vertex-1')
window.__CATAN_TEST_API.placeRoad('edge-1')
```

Useful when a Playwright flow fails and you want to reproduce by hand.

---

## Suggested workflow when fixing a bug

1. **Reproduce with the smallest suite**  
   - Illegal placement / wrong VP → `tests/rules/…`  
   - Wrong vertex ids / empty highlights → `tests/game/…`  
   - Button/status wrong → `tests/game-flow.spec.js`

2. **Add or extend a failing test first** (same file as related cases).

3. **Run only that test** with `-t` / `-g` until it fails for the right reason, then green.

4. **Run the parent file**, then `npm run test` or `npm run test:all` before pushing.

5. Prefer **deterministic** rules tests: fixed board in `fixtures.js`, explicit `dice: [a, b]`, injected `random` when needed. Avoid relying on real dice in unit tests.

---

## Writing new tests

### Rules unit test

1. Import from `src/rules/index.js` and helpers from `./fixtures.js`.
2. Prefer `newGame()` + `completeSetup()` over hand-building full boards.
3. Assert returned state; remember `applyAction` does not mutate the previous object.

```js
import { applyAction } from '../../src/rules/index.js';
import { completeSetup, newGame, setPhase } from './fixtures.js';

it('rejects endTurn before rolling', () => {
  const game = setPhase(completeSetup(newGame()), 'roll', 'p1');
  expect(() => applyAction(game, { type: 'endTurn', playerId: 'p1' })).toThrow();
});
```

### Adapter unit test

Import from `src/game/…` only; no React. Use `createRandomBoard(seed)` for stability.

### Playwright test

1. Use `data-testid` selectors (`page.getByTestId('…')`).
2. Wait for `window.__CATAN_TEST_API` and/or `__CATAN_RENDER_READY` as needed.
3. Drive setup via the test API, not canvas clicks.
4. Put new specs in `tests/*.spec.js` so Playwright picks them up and Vitest ignores them.

---

## CI mental model

```text
npm run test:all
  ├─ vitest          rules + adapters   (fast, pure JS)
  ├─ node --test     board-rules
  └─ playwright      render + game-flow (starts Vite)
```

If CI is slow, keep PRs green with `npm run test` + targeted Playwright file; run full `test:all` before merge.

---

## Troubleshooting

| Symptom | Things to try |
|---------|----------------|
| Vitest picks up Playwright files | Check `vite.config.js` → `test.include`; only `tests/rules` and `tests/game` |
| Playwright loads `*.test.js` | Check `playwright.config.js` → `testMatch: '**/*.spec.js'` |
| `__CATAN_TEST_API` is undefined | Use `npm run dev` / Playwright webServer (DEV mode); hard-refresh |
| 3D render test flakes | Wait for `__CATAN_RENDER_READY`; ensure GPU/WebGL available in CI |
| Setup e2e fails mid-snake | Log `getState()` options; illegal placement often means distance rule or wrong phase |
| Port 5173 in use | Stop the other Vite, or let Playwright `reuseExistingServer: true` attach |

---

## Related docs

- `src/rules/README.md` — rules engine API (`applyAction` contract)
- Root `README.md` — app run instructions and high-level scripts
