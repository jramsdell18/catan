import { useCallback, useEffect, useMemo, useState } from 'react';
import CatanScene from './components/CatanScene.jsx';
import { createRandomBoard } from './game/board.js';
import { getActivePlayers } from './game/pieces.js';
import {
  actionForTarget,
  describeAction,
  describeLogEntry,
  getInteractionMode,
  getLegalTargets,
  INTERACTION_LABELS,
  INTERACTION_MODES,
} from './game/interactions.js';
import {
  createBoardPorts,
  createRulesBoard,
  placementsFromGame,
  playerInventoriesFromGame,
  resourceHandsFromGame,
} from './game/rulesAdapter.js';
import { createBoardTopology } from './game/topology.js';
import { applyAction, createGame } from './rules/index.js';
import LiveKitTableCall from './stream/LiveKitTableCall.jsx';

const DEFAULT_PLAYER_COUNT = 4;
const PLAYER_COUNT_OPTIONS = [3, 4];

function rollDie() {
  return 1 + Math.floor(Math.random() * 6);
}

function App() {
  const [selectedPlayers, setSelectedPlayers] = useState(DEFAULT_PLAYER_COUNT);
  const [confirmedPlayers, setConfirmedPlayers] = useState(null);
  const [board] = useState(() => createRandomBoard());
  const [cameraResetKey, setCameraResetKey] = useState(0);
  const [game, setGame] = useState(null);
  const [gameError, setGameError] = useState('');
  const [diceRoll, setDiceRoll] = useState(null);
  const [requestedMode, setRequestedMode] = useState(null);
  const [actionFeedback, setActionFeedback] = useState({ status: 'idle', message: '' });

  const activePlayerCount = confirmedPlayers ?? selectedPlayers;
  const activePlayers = useMemo(() => getActivePlayers(activePlayerCount), [activePlayerCount]);
  const topology = useMemo(() => createBoardTopology(board.hexes), [board.hexes]);
  const ports = useMemo(() => createBoardPorts(topology, board.seed), [board.seed, topology]);
  const placements = useMemo(() => placementsFromGame(game), [game]);
  const resourceHands = useMemo(() => resourceHandsFromGame(game, activePlayers), [activePlayers, game]);
  const playerInventories = useMemo(
    () => playerInventoriesFromGame(game, activePlayers),
    [activePlayers, game],
  );
  const currentPlayer = activePlayers.find((player) => player.id === game?.currentPlayerId) ?? null;
  const diceTotal = game?.dice ? game.dice[0] + game.dice[1] : null;
  const totalCards = resourceHands.reduce((total, hand) => total + hand.cards.length, 0);
  const interactionMode = getInteractionMode(game, requestedMode);

  const playerMessage = useMemo(() => {
    if (!confirmedPlayers) return 'Choose a player count to start the room setup.';
    if (!game) return `${confirmedPlayers} players selected. Start the game when ready.`;
    if (game.phase === 'setup') {
      return `${currentPlayer?.label ?? 'Current player'} places a ${game.setupSettlementId ? 'road' : 'settlement'}.`;
    }
    if (game.phase === 'roll') return `${currentPlayer?.label ?? 'Current player'} rolls the dice.`;
    if (game.phase === 'robber') return `${currentPlayer?.label ?? 'Current player'} must move the robber.`;
    if (game.phase === 'discard') return 'Players with more than seven cards must discard.';
    if (game.phase === 'gameOver') return `${currentPlayer?.label ?? 'A player'} won the game.`;
    if (game.phase === 'action') return `${currentPlayer?.label ?? 'Current player'} may build, trade, or end the turn.`;
    return 'Game started.';
  }, [confirmedPlayers, currentPlayer, game]);

  const legalTargets = useMemo(
    () => getLegalTargets(game, topology, board, interactionMode),
    [board, game, interactionMode, topology],
  );
  const placementOptions = useMemo(
    () => ({
      settlements: legalTargets.intersections,
      roads: legalTargets.edges,
    }),
    [legalTargets],
  );

  const dispatch = useCallback((action) => {
    setActionFeedback({ status: 'pending', message: `Applying: ${describeAction(action.type)}…` });
    setGame((current) => {
      if (!current) {
        setActionFeedback({ status: 'error', message: 'Start a game before choosing an action.' });
        return current;
      }
      try {
        const next = applyAction(current, action);
        setGameError('');
        setActionFeedback({ status: 'success', message: `Success: ${describeAction(action.type)}.` });
        setRequestedMode(null);
        return next;
      } catch (error) {
        setGameError(error.message);
        setActionFeedback({ status: 'error', message: error.message });
        return current;
      }
    });
  }, []);

  const cancelInteraction = useCallback(() => {
    setRequestedMode(null);
    setGameError('');
    setActionFeedback({ status: 'idle', message: 'Action cancelled.' });
  }, []);

  function handleConfirm(event) {
    event.preventDefault();
    setConfirmedPlayers(selectedPlayers);
    setGame(null);
    setGameError('');
    setDiceRoll(null);
    setRequestedMode(null);
    setActionFeedback({ status: 'idle', message: '' });
  }

  function handleResetCamera() {
    setCameraResetKey((key) => key + 1);
  }

  function handleStartGame() {
    if (!confirmedPlayers) {
      return;
    }

    const players = getActivePlayers(confirmedPlayers);
    const rulesBoard = createRulesBoard(board, topology, ports);
    setGame(
      createGame({
        board: rulesBoard,
        players: players.map((player) => ({ ...player, name: player.label })),
      }),
    );
    setGameError('');
    setDiceRoll(null);
    setRequestedMode(null);
    setActionFeedback({ status: 'idle', message: 'Game started.' });
  }

  function handleRollDice() {
    if (game?.phase !== 'roll') {
      return;
    }

    const dice = [rollDie(), rollDie()];
    setDiceRoll((current) => ({
      values: dice,
      rollId: (current?.rollId ?? 0) + 1,
    }));
    dispatch({ type: 'rollDice', playerId: game.currentPlayerId, dice });
  }

  const handleSelectTarget = useCallback(
    (targetId) => {
      if (!game || !interactionMode) return;
      const action = actionForTarget(interactionMode, game, targetId);
      if (action) dispatch(action);
    },
    [dispatch, game, interactionMode],
  );

  const handlePlaceSettlement = useCallback(
    (vertexId) => handleSelectTarget(vertexId),
    [handleSelectTarget],
  );
  const handlePlaceRoad = useCallback((edgeId) => handleSelectTarget(edgeId), [handleSelectTarget]);

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return undefined;
    }

    window.__CATAN_TEST_API = {
      getState: () => ({
        confirmedPlayers,
        boardSeed: board.seed,
        phase: game?.phase ?? null,
        currentPlayerId: game?.currentPlayerId ?? null,
        setupSettlementId: game?.setupSettlementId ?? null,
        settlementOptions: placementOptions.settlements.map((vertex) => vertex.id),
        roadOptions: placementOptions.roads.map((edge) => edge.id),
        hexOptions: legalTargets.hexes.map((hex) => hex.hexId),
        settlementCount: placements.settlements.length,
        roadCount: placements.roads.length,
        dice: game?.dice ?? null,
        error: gameError || null,
        interactionMode,
        feedback: { ...actionFeedback },
        logLength: game?.log.length ?? 0,
        resources: game
          ? Object.fromEntries(game.players.map((player) => [player.id, { ...player.resources }]))
          : null,
      }),
      placeSettlement: handlePlaceSettlement,
      placeRoad: handlePlaceRoad,
      beginInteraction: setRequestedMode,
      cancelInteraction,
      selectTarget: handleSelectTarget,
      rollDice: (dice) => {
        if (game?.phase !== 'roll') {
          return;
        }
        const values = dice ?? [rollDie(), rollDie()];
        setDiceRoll((current) => ({
          values,
          rollId: (current?.rollId ?? 0) + 1,
        }));
        dispatch({ type: 'rollDice', playerId: game.currentPlayerId, dice: values });
      },
    };

    return () => {
      delete window.__CATAN_TEST_API;
    };
  }, [
    actionFeedback,
    board.seed,
    cancelInteraction,
    confirmedPlayers,
    dispatch,
    game,
    gameError,
    handlePlaceRoad,
    handlePlaceSettlement,
    handleSelectTarget,
    interactionMode,
    legalTargets.hexes,
    placementOptions.roads,
    placementOptions.settlements,
    placements.roads.length,
    placements.settlements.length,
  ]);

  const actionPhase = game?.phase === 'action';

  return (
    <main className="app-shell">
      <section className="game-stage" aria-label="3D Catan table">
        <CatanScene
          board={board}
          activePlayers={activePlayers}
          resourceHands={resourceHands}
          playerInventories={playerInventories}
          cameraResetKey={cameraResetKey}
          topology={topology}
          ports={game?.board.ports ?? ports}
          robberTileId={game?.board.robberTileId ?? board.hexes.find((hex) => hex.hasRobber)?.hexId}
          placements={placements}
          legalTargets={legalTargets}
          interactionMode={interactionMode}
          onSelectTarget={handleSelectTarget}
          diceRoll={diceRoll}
        />
        <LiveKitTableCall players={activePlayers} />

        {!game && (
          <div className="start-overlay" aria-labelledby="start-title">
            <p className="eyebrow">Catan Multiplayer</p>
            <h1 id="start-title">Start Game</h1>
            <form className="start-controls" onSubmit={handleConfirm} data-testid="player-setup-form">
              <label htmlFor="player-count">Players</label>
              <select
                id="player-count"
                data-testid="player-count"
                value={selectedPlayers}
                onChange={(event) => setSelectedPlayers(Number(event.target.value))}
              >
                {PLAYER_COUNT_OPTIONS.map((count) => (
                  <option key={count} value={count}>
                    {count} players
                  </option>
                ))}
              </select>
              <button type="submit" className="secondary-button" data-testid="set-players">
                Set Players
              </button>
              <button
                type="button"
                data-testid="start-game"
                onClick={handleStartGame}
                disabled={!confirmedPlayers}
              >
                Start Game
              </button>
            </form>
            <p className="helper-text" data-testid="player-setup-helper">
              {confirmedPlayers
                ? `Players ready: ${confirmedPlayers} (last confirmed: ${confirmedPlayers})`
                : `Current selection: ${selectedPlayers} players`}
            </p>
          </div>
        )}
      </section>

      <section className="game-control-panel" aria-label="Game controls">
        <div className="turn-summary" data-testid="status-panel">
          <p className="status-label">{game ? `Phase: ${game.phase}` : 'Room setup'}</p>
          <p className="status-message" data-testid="status-message">
            {playerMessage}
          </p>
          {game && (
            <p className="helper-text" data-testid="engine-phase">
              Engine phase: {game.phase}
            </p>
          )}
          {game?.dice && (
            <p className="helper-text" data-testid="last-roll">
              Last roll: {game.dice.join(' + ')} = {diceTotal}
            </p>
          )}
          {game && <p className="helper-text">Cards in play: {totalCards}</p>}
          {gameError && (
            <p className="game-error" role="alert" data-testid="game-error">
              {gameError}
            </p>
          )}
          {interactionMode && (
            <div className="interaction-status" data-testid="interaction-status">
              <strong>Board action</strong>
              <span>{INTERACTION_LABELS[interactionMode]}</span>
              {requestedMode && (
                <button
                  type="button"
                  className="secondary-button compact-button"
                  onClick={cancelInteraction}
                  data-testid="cancel-interaction"
                >
                  Cancel action
                </button>
              )}
            </div>
          )}
          {actionFeedback.message && (
            <p
              className={`action-feedback ${actionFeedback.status}`}
              aria-live="polite"
              data-testid="action-feedback"
              data-status={actionFeedback.status}
            >
              {actionFeedback.message}
            </p>
          )}
        </div>

        <div className="control-actions">
          <button type="button" data-testid="roll-dice" onClick={handleRollDice} disabled={game?.phase !== 'roll'}>
            Roll Dice
          </button>
          <button
            type="button"
            data-testid="end-turn"
            onClick={() => game && dispatch({ type: 'endTurn', playerId: game.currentPlayerId })}
            disabled={game?.phase !== 'action'}
          >
            End Turn
          </button>
          {actionPhase && (
            <>
              <button
                type="button"
                className="secondary-button"
                data-testid="build-road"
                onClick={() => setRequestedMode(INTERACTION_MODES.PLACE_ROAD)}
              >
                Build Road
              </button>
              <button
                type="button"
                className="secondary-button"
                data-testid="build-settlement"
                onClick={() => setRequestedMode(INTERACTION_MODES.PLACE_SETTLEMENT)}
              >
                Build Settlement
              </button>
              <button
                type="button"
                className="secondary-button"
                data-testid="build-city"
                onClick={() => setRequestedMode(INTERACTION_MODES.BUILD_CITY)}
              >
                Build City
              </button>
            </>
          )}
          <button type="button" className="secondary-button" data-testid="reset-camera" onClick={handleResetCamera}>
            Reset Camera
          </button>
          <button
            type="button"
            className="secondary-button"
            data-testid={game ? 'restart-game' : 'start-game-bottom'}
            onClick={handleStartGame}
            disabled={!confirmedPlayers}
          >
            {game ? 'Restart Game' : 'Start Game'}
          </button>
        </div>

        <div className="table-meta" aria-label="Table status">
          <div>
            <p className="status-label">Board seed</p>
            <p className="seed-value" data-testid="board-seed">
              {board.seed}
            </p>
          </div>
          {game && (
            <div>
              <p className="status-label">Current player</p>
              <p className="seed-value" data-testid="current-player-label">
                {currentPlayer?.label}
              </p>
            </div>
          )}
          {game && (
            <div>
              <p className="status-label">Cards in play</p>
              <p className="seed-value" data-testid="cards-in-play">
                {totalCards}
              </p>
            </div>
          )}
        </div>

        {game && (
          <div className="resource-strip" aria-label="Player resources" data-testid="player-resources">
            {game.players.map((player) => (
              <div
                className={player.id === game.currentPlayerId ? 'player-state active' : 'player-state'}
                key={player.id}
                data-testid={`player-state-${player.id}`}
                data-active={player.id === game.currentPlayerId ? 'true' : 'false'}
              >
                <strong>{player.name}</strong>
                <span data-testid={`player-resources-${player.id}`}>
                  {Object.entries(player.resources)
                    .map(([resource, count]) => `${resource}: ${count}`)
                    .join(' | ')}
                </span>
              </div>
            ))}
          </div>
        )}

        {game?.log.length > 0 && (
          <section className="history-panel" aria-labelledby="history-title" data-testid="action-history">
            <p className="status-label" id="history-title">
              Recent actions
            </p>
            <ol>
              {[...game.log]
                .reverse()
                .slice(0, 8)
                .map((entry, index) => (
                  <li key={`${game.log.length - index}-${entry.type}`}>
                    {describeLogEntry(entry, game.players)}
                  </li>
                ))}
            </ol>
          </section>
        )}
      </section>
    </main>
  );
}

export default App;
