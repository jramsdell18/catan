# Catan Multiplayer Starter

React + Three.js starter for a local multiplayer Catan-style game.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. The current screen lets you pick a player count, inspect a 3D board, and randomize the terrain layout.

## Test the rules integration

1. Run `npm install`, then `npm run dev`.
2. Choose 3 or 4 players, select **Set Players**, and select **Start Game**.
3. Follow the highlighted intersections and edges to place each settlement and road. The rules engine enforces the distance rule, road adjacency, and the two-round snake order.
4. After setup, confirm the phase changes to `roll` and every player has one wood, brick, ore, hay, and sheep.
5. Select **Roll Dice**. A normal production roll changes the phase to `action`; inspect the resource totals, then select **End Turn** and confirm the current player changes.

The engine already implements robber/discard, building, development cards, and trade commands, but the corresponding UI controls are still to be added. A roll of 7 will therefore display the required phase but cannot yet be completed from the UI.

## Scripts

- `npm run dev` starts the Vite dev server.
- `npm run build` creates a production build in `dist/`.
- `npm run preview` serves the production build locally.
- `npm run test` runs Vitest unit tests for the rules engine (`tests/rules/`).
- `npm run test:watch` runs Vitest in watch mode.
- `npm run test:rules` runs node:test checks for board number-token distribution (`tests/board-rules.test.js`).
- `npm run test:render` runs Playwright checks that the 3D board renders on desktop and mobile viewports.
- `npm run test:all` runs rules-engine unit tests, board-token checks, then Playwright render checks.

## Project layout

```text
src/
  components/
    CatanScene.jsx
    PlayerSetup.jsx
  game/
    board.js
    pieces.js
    terrain.js
  three/
    meshFactories.js
  App.jsx
  main.jsx
  styles.css
```

The UI is mobile-first so it has a reasonable starting point for small screens before adding more game features.

## 3D board plan

1. Board data
   - Keep terrain counts and resource mapping in `src/game/terrain.js`.
   - Generate the 19 base-game hex slots in `src/game/board.js` using the 3-4-5-4-3 island shape.
   - Randomize terrain from a deck so each board always has the correct counts.

2. Piece data
   - Keep player colors and piece inventory in `src/game/pieces.js`.
   - Roads, settlements, and cities use a `player.color` attribute so the same mesh definition can render for any player.
   - The robber is a neutral piece and starts on the desert.

3. Rendering
   - Keep Three.js primitive mesh creation in `src/three/meshFactories.js`.
   - Keep React scene lifecycle and camera controls in `src/components/CatanScene.jsx`.
   - Start with clean primitive meshes, then replace or enhance the factories later with custom models.

4. Next steps
   - Add number tokens and the rule that red numbers 6 and 8 should not be adjacent.
   - Add real vertex/intersection and edge/path coordinates for placing settlements, cities, and roads.
   - Add click or tap selection for hexes, paths, and intersections.
   - Add room state, turn state, and multiplayer sync after the board model is stable.
