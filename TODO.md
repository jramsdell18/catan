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

- [ ] Render number tokens on every productive hex.
- [ ] Visually emphasize number tokens 6 and 8.
- [ ] Generate number tokens with the intended distribution.
- [ ] Prevent 6 and 8 tokens from being adjacent.
- [ ] Add port locations to the generated topology.
- [ ] Generate generic 3:1 and resource-specific 2:1 ports.
- [ ] Render ports and their trade ratios.
- [ ] Render the robber from `game.board.robberTileId` instead of the original desert flag.
- [ ] Add board-generation tests for terrain counts, number counts, 6/8 adjacency, desert, ports, and topology validity.

### Done when

A randomized board contains every piece of data required by the rules engine, passes board validation, and communicates numbers, ports, and robber position visually.

## Milestone 2: Generalize UI-to-engine actions

These tasks prevent each new feature from inventing a separate interaction pattern.

- [ ] Add a reusable action dispatcher with pending, success, and error feedback.
- [ ] Introduce UI interaction modes such as `placeRoad`, `placeSettlement`, `buildCity`, and `moveRobber`.
- [ ] Add a consistent cancel action for board-selection modes.
- [ ] Derive all roads, settlements, cities, robber state, resources, pieces, and phase prompts from engine state.
- [ ] Add reusable legal-target highlights for intersections, edges, and hexes.
- [ ] Add an action/event history panel based on the engine log.

### Done when

The UI never changes authoritative game values directly; every game change is an engine command and every rendered game object is derived from the returned state.

## Milestone 3: Normal building and city rendering

- [ ] Add Build Road, Build Settlement, and Build City controls.
- [ ] Show the resource cost beside each build action.
- [ ] Disable build actions when the player cannot afford them or has no pieces left.
- [ ] Highlight legal road and settlement locations during the action phase.
- [ ] Highlight owned settlements eligible for a city upgrade.
- [ ] Render cities distinctly from settlements.
- [ ] Support multiple build actions before ending the turn.
- [ ] Display clear engine validation errors for illegal placement or payment.
- [ ] Add UI integration tests for roads, settlements, cities, costs, and piece inventory.

### Done when

After rolling, a player can legally build every piece type, see the correct resource payment and inventory change, and continue acting until ending the turn.

## Milestone 4: Complete dice production and robber workflows

- [ ] Show a clear dice result and highlight producing hexes.
- [ ] Show which resources each player received.
- [ ] Explain production skipped because of bank shortages.
- [ ] When a 7 is rolled, calculate and display every required discard count.
- [ ] Add resource-selection forms for discarding exactly half the required hand.
- [ ] Prevent robber movement until all required discards are complete.
- [ ] Highlight legal robber destination hexes.
- [ ] Show eligible victims adjacent to the selected hex.
- [ ] Allow the active player to choose a victim or confirm that no victim is available.
- [ ] Move the rendered robber to its new hex.
- [ ] Display the stolen result without exposing hidden information to other players.
- [ ] Add UI integration tests for production, bank shortages, discards, robber movement, and theft.

### Done when

Every possible dice result, including 7, can be resolved entirely from the UI without restarting or manually changing state.

## Milestone 5: Maritime and domestic trading

### Maritime trade

- [ ] Add give-resource and receive-resource selectors.
- [ ] Calculate and display the player's best available 4:1, 3:1, or 2:1 ratio.
- [ ] Show which ports the player controls.
- [ ] Disable trades the player or bank cannot fulfill.
- [ ] Dispatch maritime trades through the engine.

### Domestic trade

- [ ] Add an offer builder for resources given and requested.
- [ ] Allow offers to target one player or remain open to opponents.
- [ ] Add accept, reject, cancel, and expiration states.
- [ ] Revalidate both hands when an offer is accepted.
- [ ] Display pending and completed trades in the event history.
- [ ] Add UI integration tests for valid, invalid, stale, cancelled, maritime, and domestic trades.

### Done when

Players can perform every legal bank, port, and player trade without directly editing resource totals.

## Milestone 6: Development cards

- [ ] Add a Buy Development Card control with its cost and availability.
- [ ] Display development cards privately to their owner.
- [ ] Indicate cards bought this turn that cannot yet be played.
- [ ] Add the Knight workflow using the robber interaction mode.
- [ ] Add resource selection for Year of Plenty.
- [ ] Add resource selection for Monopoly.
- [ ] Add one-or-two-road placement for Road Building.
- [ ] Keep victory-point cards hidden while including them in scoring.
- [ ] Enforce the one-development-card-per-turn rule in the UI.
- [ ] Add UI integration tests for buying and playing every development-card type.

### Done when

Every development card supported by the engine can be bought, privately inspected, and legally resolved from the UI.

## Milestone 7: Scoring, awards, and game completion

- [ ] Display public settlement and city points.
- [ ] Display Longest Road owner and length.
- [ ] Display Largest Army owner and knight count.
- [ ] Show each player their private victory-point total.
- [ ] Add focused engine tests for branching roads, loops, blocked roads, award transfers, and hidden victory points.
- [ ] Show a game-over screen when a player reaches the configured victory target.
- [ ] Display the winner and final public scores.
- [ ] Add confirmed Restart Game and New Game actions.
- [ ] Add an automated end-to-end scenario that reaches a legal victory.

### Done when

A local game can proceed from setup through a rules-validated victory without unsupported phases or manual state changes.

## Milestone 8: Local-game privacy and persistence

- [ ] Add a pass-device screen between local players.
- [ ] Hide resource identities belonging to other players.
- [ ] Hide development cards belonging to other players.
- [ ] Require confirmation before revealing the active player's private view.
- [ ] Implement `getPlayerView(game, playerId)` as the shared state-sanitization boundary.
- [ ] Add save and resume support for a local game.
- [ ] Add tests that private cards never appear in another player's view.

### Done when

Players can complete a pass-and-play game on one device without casually exposing private hands, and can resume an interrupted game.

## Milestone 9: Local release quality

- [ ] Add contextual rules help and a build-cost reference.
- [ ] Add confirmations for expensive or irreversible actions where useful.
- [ ] Review keyboard, touch, focus, color contrast, and screen-reader accessibility.
- [ ] Test the complete game on desktop and mobile viewports.
- [ ] Add deterministic test-board and dice controls available only in development/test builds.
- [ ] Resolve production bundle-size warnings or document the accepted tradeoff.
- [ ] Run `npm test`, `npm run test:render`, and `npm run build` in CI.

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
