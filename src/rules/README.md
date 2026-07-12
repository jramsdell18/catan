# Catan rules engine

This directory contains UI-agnostic base-game rules for a 3–4 player multiplayer game. Keep the authoritative state on the server and pass player commands through `applyAction`; it returns a new state and never mutates the supplied state.

## Board contract

The visual board supplies stable ids and topology. Call `createBoard` with:

- `tiles`: `{ id, terrain, number, intersections: [...] }`
- `intersections`: `{ id }`
- `edges`: `{ id, intersections: [a, b] }`
- `ports`: `{ intersections: [a, b], ratio, resource }`; `resource: null` is a generic 3:1 port
- `robberTileId`: normally the desert id

The engine therefore works with an SVG, canvas, DOM, or network representation without embedding pixel coordinates.

```js
import { applyAction, createBoard, createGame } from './rules/index.js';

const board = createBoard(boardData);
let game = createGame({
  board,
  players: [
    { id: 'p1', name: 'Ada', color: 'red' },
    { id: 'p2', name: 'Lin', color: 'blue' },
    { id: 'p3', name: 'Sam', color: 'white' },
  ],
});

game = applyAction(game, { type: 'placeSettlement', playerId: 'p1', intersectionId: 'i12' });
game = applyAction(game, { type: 'placeRoad', playerId: 'p1', edgeId: 'e18' });
```

## Supported commands

`placeSettlement`, `placeRoad`, `buildCity`, `rollDice`, `discard`, `moveRobber`, `buyDevelopment`, `playDevelopment`, `maritimeTrade`, `offerTrade`, `acceptTrade`, `cancelTrade`, and `endTurn`.

The engine covers the usual base-game setup snake, distance/connectivity rules, costs and piece limits, production and bank shortages, robber/discards, domestic and maritime trade, development cards, longest road (including blocking), largest army, and a 10-point win. Victory-point cards are represented in full engine state and must be hidden from opponents via `getPlayerView` (see below) before showing a seat’s UI or sending state to a client.

## Player views (privacy boundary)

Full engine state is authoritative and **not** safe to show to a single player. Build a seat-scoped snapshot with:

```js
import { getPlayerView, publicVictoryPoints, privateVictoryPoints } from './rules/index.js';

const view = getPlayerView(game, 'p1');
// view.players.find(p => p.id === 'p1').resources          // full hand
// view.players.find(p => p.id === 'p2').resources          // null
// view.players.find(p => p.id === 'p2').resourceCount      // public card count
// view.developmentDeck                                     // null
// view.developmentDeckCount                                // remaining cards
```

| Field | Viewer (self) | Opponents |
|-------|---------------|-----------|
| Resource breakdown | Full | Hidden (`null`); `resourceCount` only |
| Development card types | Full list | Hidden (`null`); `developmentCardCount` only |
| VP total | `privateVictoryPoints` (includes VP cards) | `publicVictoryPoints` only (no VP cards) |
| Dev deck order | Never exposed | Never exposed |
| Board, bank, phase, dice, awards | Public | Public |

Use `publicVictoryPoints` for scoreboard UI and `privateVictoryPoints` only for the owning player (or win checks on the server).

Two-player Catan and 5–6 player Catan are not base-game modes. Add their variant/expansion turn rules separately before exposing them as standard games.
