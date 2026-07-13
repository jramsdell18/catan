# Catan development roadmap

This roadmap is ordered by dependency and delivery value. Finish each milestone before moving to the next unless a task is explicitly optional. The first major target is a complete local game; online multiplayer follows after the local rules and UI are stable.

## Milestone 0: Current foundation

- [x] Generate and render the 19-hex 3D board.
- [x] Generate shared intersection and edge topology.
- [x] Support three- and four-player games.
- [x] Integrate setup placement with the rules engine.
- [x] Enforce setup settlement distance and road adjacency.
- [x] Implement the two-round snake setup order.
- [x] Give every player one wood, brick, ore, hay, and sheep after their second settlement.
- [x] Display current phase, player resources, piece inventory, dice, and active player.
- [x] Support basic dice rolls and end-turn transitions.
- [x] Add rules unit tests and desktop/mobile render tests.

## Milestone 1: Complete and validate the board model

These tasks establish all board data needed by later gameplay UI.

- [x] Render number tokens on every productive hex.
- [x] Visually emphasize number tokens 6 and 8.
- [x] Generate number tokens with the intended distribution.
- [x] Prevent 6 and 8 tokens from being adjacent.
- [x] Add port locations to the generated topology.
- [x] Generate generic 3:1 and resource-specific 2:1 ports.
- [x] Render ports and their trade ratios.
- [x] Render the robber from `game.board.robberTileId` instead of the original desert flag.
- [x] Add board-generation tests for terrain counts, number counts, 6/8 adjacency, desert, ports, and topology validity.

### Done when

A randomized board contains every piece of data required by the rules engine, passes board validation, and communicates numbers, ports, and robber position visually.

## Milestone 2: Generalize UI-to-engine actions

### High-level goal

Create one reliable interaction system between the player, the 3D board, and the rules engine. When a player chooses an action, the UI enters a clear mode, shows only legal targets, sends the resulting command to the engine, and renders the authoritative state returned by the engine.

This milestone is primarily architecture and user-experience groundwork rather than a large set of new Catan rules. It replaces feature-specific click handling with reusable patterns that later milestones can use for building roads, placing settlements, upgrading cities, moving the robber, selecting victims, and resolving development cards.

### What this unlocks for players

- Every board action follows the same understandable flow: choose an action, see legal targets, select a target, and receive clear confirmation or an error.
- Players can cancel an unfinished board action without accidentally changing game state.
- The pieces, resources, robber, and prompts shown on screen consistently match the rules engine.
- Players receive visible feedback about what happened instead of having to infer it from the board.
- The action history makes turns easier to follow and provides a foundation for debugging, replays, and multiplayer synchronization.

### Impact on completing a full game

Milestone 2 does not by itself make every Catan action playable. It creates the shared interaction pipeline required by Milestones 3–7. Without it, building, robber movement, trading, development cards, and scoring would each need separate UI logic and could drift away from the authoritative rules.

After this milestone, new gameplay features become smaller integrations: define the available command, derive its legal targets, and render the engine result. Completing it lowers the risk of illegal client-side actions and makes it practical to add the remaining full-game workflows consistently.

### Implementation tasks

- [x] Add a reusable action dispatcher with pending, success, and error feedback.
- [x] Introduce UI interaction modes such as `placeRoad`, `placeSettlement`, `buildCity`, and `moveRobber`.
- [x] Add a consistent cancel action for board-selection modes.
- [x] Derive all roads, settlements, cities, robber state, resources, pieces, and phase prompts from engine state.
- [x] Add reusable legal-target highlights for intersections, edges, and hexes.
- [x] Add an action/event history panel based on the engine log.

### Done when

The UI never changes authoritative game values directly; every game change is an engine command and every rendered game object is derived from the returned state.

## Milestone 3: Normal building and city rendering

- [x] Add Build Road, Build Settlement, and Build City controls.
- [x] Show the resource cost beside each build action.
- [x] Disable build actions when the player cannot afford them or has no pieces left.
- [x] Highlight legal road and settlement locations during the action phase.
- [x] Highlight owned settlements eligible for a city upgrade.
- [x] Render cities distinctly from settlements.
- [x] Support multiple build actions before ending the turn.
- [x] Display clear engine validation errors for illegal placement or payment.
- [x] Add UI integration tests for roads, settlements, cities, costs, and piece inventory.

### Done when

After rolling, a player can legally build every piece type, see the correct resource payment and inventory change, and continue acting until ending the turn.

## Milestone 4: Complete dice production and robber workflows

- [x] Show a clear dice result and highlight producing hexes.
- [x] Show which resources each player received.
- [x] Explain production skipped because of bank shortages.
- [x] When a 7 is rolled, calculate and display every required discard count.
- [x] Add resource-selection forms for discarding exactly half the required hand.
- [x] Prevent robber movement until all required discards are complete.
- [x] Highlight legal robber destination hexes.
- [x] Show eligible victims adjacent to the selected hex.
- [x] Allow the active player to choose a victim or confirm that no victim is available.
- [x] Move the rendered robber to its new hex.
- [x] Display the stolen result without exposing hidden information to other players.
- [x] Add UI integration tests for production, bank shortages, discards, robber movement, and theft.

### Done when

Every possible dice result, including 7, can be resolved entirely from the UI without restarting or manually changing state.

## Milestone 5: Maritime and domestic trading

### Maritime trade

- [x] Add give-resource and receive-resource selectors.
- [x] Calculate and display the player's best available 4:1, 3:1, or 2:1 ratio.
- [x] Show which ports the player controls.
- [x] Disable trades the player or bank cannot fulfill.
- [x] Dispatch maritime trades through the engine.

### Domestic trade

- [x] Add an offer builder for resources given and requested.
- [x] Allow offers to target one player or remain open to opponents.
- [x] Add accept, reject, cancel, and expiration states.
- [x] Revalidate both hands when an offer is accepted.
- [x] Display pending and completed trades in the event history.
- [x] Add UI integration tests for valid, invalid, stale, cancelled, maritime, and domestic trades.

### Done when

Players can perform every legal bank, port, and player trade without directly editing resource totals.

## Milestone 6: Development cards

- [x] Add a Buy Development Card control with its cost and availability.
- [x] Display development cards privately to their owner.
- [x] Indicate cards bought this turn that cannot yet be played.
- [x] Add the Knight workflow using the robber interaction mode.
- [x] Add resource selection for Year of Plenty.
- [x] Add resource selection for Monopoly.
- [x] Add one-or-two-road placement for Road Building.
- [x] Keep victory-point cards hidden while including them in scoring.
- [x] Enforce the one-development-card-per-turn rule in the UI.
- [x] Add UI integration tests for buying and playing every development-card type.

### Done when

Every development card supported by the engine can be bought, privately inspected, and legally resolved from the UI.

## Milestone 7: Scoring, awards, and game completion

- [x] Display public settlement and city points.
- [x] Display Longest Road owner and length.
- [x] Display Largest Army owner and knight count.
- [x] Show each player their private victory-point total.
- [x] Add focused engine tests for branching roads, loops, blocked roads, award transfers, and hidden victory points.
- [x] Add `getScoreBreakdown` / `publicVictoryPoints` helpers for scoreboard UI.
- [x] Show a game-over screen when a player reaches the configured victory target.
- [x] Display the winner and final public scores.
- [x] Add confirmed Restart Game and New Game actions.
- [x] Add an automated end-to-end scenario that reaches a legal victory.

### Done when

A local game can proceed from setup through a rules-validated victory without unsupported phases or manual state changes.

## Milestone 8: Local-game privacy and persistence

- [ ] Add a pass-device screen between local players.
- [x] Hide resource identities belonging to other players. *(engine view + ResourceStrip)*
- [x] Hide development cards belonging to other players. *(engine view; private hand UI later)*
- [ ] Require confirmation before revealing the active player's private view.
- [x] Implement `getPlayerView(game, playerId)` as the shared state-sanitization boundary.
- [x] Wire seat view into UI (`usePlayerView` → ResourceStrip / RollOutcome).
- [ ] Add save and resume support for a local game.
- [x] Add tests that private cards never appear in another player's view.

### Done when

Players can complete a pass-and-play game on one device without casually exposing private hands, and can resume an interrupted game.

## Milestone 9: Local release quality

- [ ] Add contextual rules help and a build-cost reference.
- [ ] Add confirmations for expensive or irreversible actions where useful.
- [ ] Review keyboard, touch, focus, color contrast, and screen-reader accessibility.
- [ ] Test the complete game on desktop and mobile viewports.
- [ ] Add deterministic test-board and dice controls available only in development/test builds.
- [ ] Resolve production bundle-size warnings or document the accepted tradeoff.
- [x] Run `npm test`, board-rules, Playwright e2e, and `npm run build` in CI (`.github/workflows/ci.yml`).

### Done when

The local game is understandable, accessible, repeatably testable, and ready to be treated as the stable client foundation.

## Milestone 10: Multiplayer server foundation

Begin this milestone only after the local game is complete and engine state can be safely sanitized.

- [ ] Choose and document the server runtime, transport, and persistence approach.
- [ ] Create rooms and human-friendly join codes.
- [ ] Add join, leave, seat assignment, color selection, ready state, and game start.
- [ ] Store the authoritative game state on the server.
- [ ] Run all player commands through server-side `applyAction`.
- [ ] Reject malformed, stale, unauthorized, and out-of-turn commands.
- [ ] Add monotonically increasing state/action versions.

## Milestone 11: Real-time multiplayer and private state

- [ ] Synchronize commands and public state over WebSockets.
- [ ] Send each client only its sanitized player view.
- [ ] Broadcast public events without leaking hidden resources or development cards.
- [ ] Restore identity after a page refresh.
- [ ] Reconnect players to the latest state.
- [ ] Handle disconnects, abandoned games, and host departure.
- [ ] Add multiplayer tests using multiple simultaneous clients.

## Milestone 12: Persistence, operations, and security

- [ ] Persist active games and restore them after a server restart.
- [ ] Optionally store completed-game history and replays.
- [ ] Add command rate limiting and payload-size limits.
- [ ] Add structured server logs and error monitoring.
- [ ] Add deployment configuration and environment documentation.
- [ ] Test reconnects, duplicate commands, stale versions, and information-leak boundaries.

### Online done when

Three or four players on separate clients can join a room, complete a game, reconnect safely, and never receive another player's hidden information.

## Verification commands

```bash
npm test
npm run test:render
npm run build
```
