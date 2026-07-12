import { useCallback, useEffect, useMemo, useState } from 'react';
import CatanScene from './components/CatanScene.jsx';
import { createRandomBoard } from './game/board.js';
import { createPlayerInventories, getActivePlayers } from './game/pieces.js';
import { createBoardPorts, createRulesBoard, placementsFromGame, resourceHandsFromGame } from './game/rulesAdapter.js';
import { createBoardTopology } from './game/topology.js';
import { applyAction, canPlaceRoad, canPlaceSettlement, createGame } from './rules/index.js';
import JitsiOverlay from './stream/JitsiOverlay.jsx';

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

  const activePlayerCount = confirmedPlayers ?? selectedPlayers;
  const activePlayers = useMemo(() => getActivePlayers(activePlayerCount), [activePlayerCount]);
  const topology = useMemo(() => createBoardTopology(board.hexes), [board.hexes]);
  const ports = useMemo(() => createBoardPorts(topology, board.seed), [board.seed, topology]);
  const placements = useMemo(() => placementsFromGame(game), [game]);
  const resourceHands = useMemo(() => resourceHandsFromGame(game, activePlayers), [activePlayers, game]);
  const playerInventories = useMemo(
    () => createPlayerInventories(activePlayers, placements),
    [activePlayers, placements],
  );
  const currentPlayer = activePlayers.find((player) => player.id === game?.currentPlayerId) ?? null;
  const diceTotal = game?.dice ? game.dice[0] + game.dice[1] : null;
  const totalCards = resourceHands.reduce((total, hand) => total + hand.cards.length, 0);

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

  const placementOptions = useMemo(() => {
    if (!game || game.phase !== 'setup') {
      return { settlements: [], roads: [] };
    }
    if (!game.setupSettlementId) {
      return {
        settlements: topology.vertices.filter((vertex) =>
          canPlaceSettlement(game.board, vertex.id, game.currentPlayerId, false),
        ),
        roads: [],
      };
    }
    return {
      settlements: [],
      roads: topology.edges.filter((edge) =>
        canPlaceRoad(game.board, edge.id, game.currentPlayerId, game.setupSettlementId),
      ),
    };
  }, [game, topology]);

  const dispatch = useCallback((action) => {
    setGame((current) => {
      if (!current) return current;
      try {
        const next = applyAction(current, action);
        setGameError('');
        return next;
      } catch (error) {
        setGameError(error.message);
        return current;
      }
    });
  }, []);

  function handleConfirm(event) {
    event.preventDefault();
    setConfirmedPlayers(selectedPlayers);
    setGame(null);
    setGameError('');
    setDiceRoll(null);
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
    setGame(createGame({
      board: rulesBoard,
      players: players.map((player) => ({ ...player, name: player.label })),
    }));
    setGameError('');
    setDiceRoll(null);
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

  const handlePlaceSettlement = useCallback(
    (vertexId) => {
      if (game?.phase === 'setup' && !game.setupSettlementId) {
        dispatch({ type: 'placeSettlement', playerId: game.currentPlayerId, intersectionId: vertexId });
      }
    },
    [dispatch, game],
  );

  const handlePlaceRoad = useCallback(
    (edgeId) => {
      if (game?.phase === 'setup' && game.setupSettlementId) {
        dispatch({ type: 'placeRoad', playerId: game.currentPlayerId, edgeId });
      }
    },
    [dispatch, game],
  );

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
        settlementCount: placements.settlements.length,
        roadCount: placements.roads.length,
        dice: game?.dice ?? null,
        error: gameError || null,
        resources: game
          ? Object.fromEntries(
              game.players.map((player) => [player.id, { ...player.resources }]),
            )
          : null,
      }),
      placeSettlement: handlePlaceSettlement,
      placeRoad: handlePlaceRoad,
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
    board.seed,
    confirmedPlayers,
    dispatch,
    game,
    gameError,
    handlePlaceRoad,
    handlePlaceSettlement,
    placementOptions.roads,
    placementOptions.settlements,
    placements.roads.length,
    placements.settlements.length,
  ]);

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
          placementOptions={placementOptions}
          onPlaceSettlement={handlePlaceSettlement}
          onPlaceRoad={handlePlaceRoad}
          diceRoll={diceRoll}
        />

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
              <button type="button" data-testid="start-game" onClick={handleStartGame} disabled={!confirmedPlayers}>
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
          <button type="button" className="secondary-button" data-testid="reset-camera" onClick={handleResetCamera}>
            Reset Camera
          </button>
          <button
            type="button"
            className="secondary-button"
            data-testid={game ? 'start-game' : 'start-game-bottom'}
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
      </section>

      <JitsiOverlay />
    </main>
  );
}

export default App;
