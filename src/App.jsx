import { useCallback, useEffect, useMemo, useState } from 'react';
import CatanScene from './components/CatanScene.jsx';
import PlayerSetup from './components/PlayerSetup.jsx';
import { createRandomBoard } from './game/board.js';
import { createPlayerInventories, getActivePlayers, PLAYER_PIECE_TYPES } from './game/pieces.js';
import { createRulesBoard, placementsFromGame, resourceHandsFromGame } from './game/rulesAdapter.js';
import { createBoardTopology } from './game/topology.js';
import { applyAction, canPlaceRoad, canPlaceSettlement, createGame } from './rules/index.js';
import JitsiOverlay from './stream/JitsiOverlay.jsx';

const DEFAULT_PLAYER_COUNT = 4;

function rollDie() {
  return 1 + Math.floor(Math.random() * 6);
}

function App() {
  const [selectedPlayers, setSelectedPlayers] = useState(DEFAULT_PLAYER_COUNT);
  const [confirmedPlayers, setConfirmedPlayers] = useState(null);
  const [board, setBoard] = useState(() => createRandomBoard());
  const [cameraResetKey, setCameraResetKey] = useState(0);
  const [game, setGame] = useState(null);
  const [gameError, setGameError] = useState('');
  const [diceRoll, setDiceRoll] = useState(null);

  const activePlayerCount = confirmedPlayers ?? selectedPlayers;
  const activePlayers = useMemo(() => getActivePlayers(activePlayerCount), [activePlayerCount]);
  const topology = useMemo(() => createBoardTopology(board.hexes), [board.hexes]);
  const placements = useMemo(() => placementsFromGame(game), [game]);
  const resourceHands = useMemo(() => resourceHandsFromGame(game, activePlayers), [activePlayers, game]);
  const playerInventories = useMemo(
    () => createPlayerInventories(activePlayers, placements),
    [activePlayers, placements],
  );
  const currentPlayer = activePlayers.find((player) => player.id === game?.currentPlayerId) ?? null;
  const diceTotal = game?.dice ? game.dice[0] + game.dice[1] : null;

  const playerMessage = useMemo(() => {
    if (!confirmedPlayers) {
      return 'Choose a player count to start the room setup.';
    }
    if (!game) return `${confirmedPlayers} players selected. Start the game when ready.`;
    if (game.phase === 'setup') {
      return `${currentPlayer?.label ?? 'Current player'} places a ${game.setupSettlementId ? 'road' : 'settlement'}.`;
    }
    if (game.phase === 'roll') return `${currentPlayer?.label} rolls the dice.`;
    if (game.phase === 'robber') return `${currentPlayer?.label} must move the robber (UI coming next).`;
    if (game.phase === 'discard') return 'Players with more than seven cards must discard (UI coming next).';
    if (game.phase === 'gameOver') return `${currentPlayer?.label ?? 'A player'} won the game.`;
    if (game.phase === 'action') return `${currentPlayer?.label} may build, trade, or end the turn.`;
    return `${confirmedPlayers} players selected. Start the game to choose the first player.`;
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

  function handleRandomizeBoard() {
    setBoard(createRandomBoard());
    setGame(null);
    setGameError('');
    setDiceRoll(null);
  }

  function handleResetCamera() {
    setCameraResetKey((key) => key + 1);
  }

  function handleStartGame() {
    const players = getActivePlayers(confirmedPlayers ?? selectedPlayers);
    const rulesBoard = createRulesBoard(board, topology);
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

  // Dev-only hooks for Playwright / manual debugging (not a production multiplayer API).
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
        error: gameError || null,
        resources: game
          ? Object.fromEntries(
              game.players.map((player) => [player.id, { ...player.resources }]),
            )
          : null,
      }),
      placeSettlement: handlePlaceSettlement,
      placeRoad: handlePlaceRoad,
    };

    return () => {
      delete window.__CATAN_TEST_API;
    };
  }, [
    board.seed,
    confirmedPlayers,
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
      <section className="setup-section" aria-labelledby="setup-title">
        <div className="setup-copy">
          <p className="eyebrow">Catan Multiplayer</p>
          <h1 id="setup-title">3D board sandbox</h1>
          <p className="intro">
            Pick the number of players, randomize the starting island, and inspect the first 3D
            piece definitions for a future multiplayer board.
          </p>
        </div>

        <PlayerSetup
          selectedPlayers={selectedPlayers}
          confirmedPlayers={confirmedPlayers}
          onChangePlayers={setSelectedPlayers}
          onConfirm={handleConfirm}
        />

        <div className="debug-actions" aria-label="Board debug controls">
          <button type="button" data-testid="randomize-board" onClick={handleRandomizeBoard}>
            Randomize Board
          </button>
          <button
            type="button"
            className="secondary-button"
            data-testid="reset-camera"
            onClick={handleResetCamera}
          >
            Reset Camera
          </button>
          <button
            type="button"
            data-testid="start-game"
            onClick={handleStartGame}
            disabled={!confirmedPlayers}
          >
            {game ? 'Restart Game' : 'Start Game'}
          </button>
          <button
            type="button"
            data-testid="roll-dice"
            onClick={handleRollDice}
            disabled={game?.phase !== 'roll'}
          >
            Roll Dice
          </button>
          <button
            type="button"
            data-testid="end-turn"
            onClick={() => dispatch({ type: 'endTurn', playerId: game.currentPlayerId })}
            disabled={game?.phase !== 'action'}
          >
            End Turn
          </button>
        </div>

        <div className="status-panel" data-testid="status-panel">
          <p className="status-label">Room setup</p>
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
          {gameError && (
            <p className="game-error" role="alert" data-testid="game-error">
              {gameError}
            </p>
          )}
        </div>

        {game && (
          <div className="player-state-list" aria-label="Player resources" data-testid="player-resources">
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
                    .join(' · ')}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="inventory-grid" aria-label="Catan piece inventory">
          {Object.values(PLAYER_PIECE_TYPES).map((piece) => (
            <div key={piece.id} className="inventory-item">
              <span>{piece.label}</span>
              <strong>{piece.maxPerPlayer} each</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="game-space" aria-label="Current 3D game setup">
        <CatanScene
          board={board}
          activePlayers={activePlayers}
          resourceHands={resourceHands}
          playerInventories={playerInventories}
          cameraResetKey={cameraResetKey}
          topology={topology}
          placements={placements}
          placementOptions={placementOptions}
          onPlaceSettlement={handlePlaceSettlement}
          onPlaceRoad={handlePlaceRoad}
          diceRoll={diceRoll}
        />

        <div className="board-debug">
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
                {resourceHands.reduce((total, hand) => total + hand.cards.length, 0)}
              </p>
            </div>
          )}
          {game?.dice && (
            <div>
              <p className="status-label">Dice total</p>
              <p className="seed-value">{diceTotal}</p>
            </div>
          )}
        </div>
      </section>

      <JitsiOverlay />
    </main>
  );
}

export default App;
