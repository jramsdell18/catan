import { useCallback, useMemo, useState } from 'react';
import CatanScene from './components/CatanScene.jsx';
import { createRandomBoard } from './game/board.js';
import { createPlayerInventories, getActivePlayers } from './game/pieces.js';
import { createRulesBoard, placementsFromGame, resourceHandsFromGame } from './game/rulesAdapter.js';
import { createBoardTopology } from './game/topology.js';
import { applyAction, canPlaceRoad, canPlaceSettlement, createGame } from './rules/index.js';

const DEFAULT_PLAYER_COUNT = 4;
const PLAYER_COUNT_OPTIONS = [3, 4];

function App() {
  const [selectedPlayers, setSelectedPlayers] = useState(DEFAULT_PLAYER_COUNT);
  const [confirmedPlayers, setConfirmedPlayers] = useState(null);
  const [board] = useState(() => createRandomBoard());
  const [cameraResetKey, setCameraResetKey] = useState(0);
  const [game, setGame] = useState(null);
  const [gameError, setGameError] = useState('');

  const activePlayerCount = game ? confirmedPlayers ?? selectedPlayers : selectedPlayers;
  const activePlayers = useMemo(() => getActivePlayers(activePlayerCount), [activePlayerCount]);
  const topology = useMemo(() => createBoardTopology(board.hexes), [board.hexes]);
  const placements = useMemo(() => placementsFromGame(game), [game]);
  const resourceHands = useMemo(() => resourceHandsFromGame(game, activePlayers), [activePlayers, game]);
  const playerInventories = useMemo(
    () => createPlayerInventories(activePlayers, placements),
    [activePlayers, placements],
  );
  const currentPlayer = activePlayers.find((player) => player.id === game?.currentPlayerId) ?? null;

  const playerMessage = useMemo(() => {
    if (!game) return 'Select players and start the table.';
    if (game.phase === 'setup') {
      return `${currentPlayer?.label ?? 'Current player'} places a ${game.setupSettlementId ? 'road' : 'settlement'}.`;
    }
    if (game.phase === 'roll') return `${currentPlayer?.label ?? 'Current player'} rolls the dice.`;
    if (game.phase === 'robber') return `${currentPlayer?.label ?? 'Current player'} must move the robber.`;
    if (game.phase === 'discard') return 'Players with more than seven cards must discard.';
    if (game.phase === 'gameOver') return `${currentPlayer?.label ?? 'A player'} won the game.`;
    if (game.phase === 'action') return `${currentPlayer?.label ?? 'Current player'} may build, trade, or end the turn.`;
    return 'Game started.';
  }, [currentPlayer, game]);

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

  function handleResetCamera() {
    setCameraResetKey((key) => key + 1);
  }

  function handleStartGame() {
    const playerCount = selectedPlayers;
    const players = getActivePlayers(playerCount);
    const rulesBoard = createRulesBoard(board, topology);
    setConfirmedPlayers(playerCount);
    setGame(createGame({
      board: rulesBoard,
      players: players.map((player) => ({ ...player, name: player.label })),
    }));
    setGameError('');
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

  const totalCards = resourceHands.reduce((total, hand) => total + hand.cards.length, 0);
  const diceTotal = game?.dice ? game.dice[0] + game.dice[1] : null;

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
          placements={placements}
          placementOptions={placementOptions}
          onPlaceSettlement={handlePlaceSettlement}
          onPlaceRoad={handlePlaceRoad}
        />

        {!game && (
          <div className="start-overlay" aria-labelledby="start-title">
            <p className="eyebrow">Catan Multiplayer</p>
            <h1 id="start-title">Start Game</h1>
            <div className="start-controls">
              <label htmlFor="player-count">Players</label>
              <select
                id="player-count"
                value={selectedPlayers}
                onChange={(event) => setSelectedPlayers(Number(event.target.value))}
              >
                {PLAYER_COUNT_OPTIONS.map((count) => (
                  <option key={count} value={count}>
                    {count} players
                  </option>
                ))}
              </select>
              <button type="button" onClick={handleStartGame}>
                Start Game
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="game-control-panel" aria-label="Game controls">
        <div className="turn-summary">
          <p className="status-label">{game ? `Phase: ${game.phase}` : 'Ready'}</p>
          <p className="status-message">{playerMessage}</p>
          {game?.dice && (
            <p className="helper-text">
              Last roll: {game.dice.join(' + ')} = {diceTotal}
            </p>
          )}
          {game && <p className="helper-text">Cards in play: {totalCards}</p>}
          {gameError && <p className="game-error" role="alert">{gameError}</p>}
        </div>

        <div className="control-actions">
          <button
            type="button"
            onClick={() => game && dispatch({ type: 'rollDice', playerId: game.currentPlayerId })}
            disabled={game?.phase !== 'roll'}
          >
            Roll Dice
          </button>
          <button
            type="button"
            onClick={() => game && dispatch({ type: 'endTurn', playerId: game.currentPlayerId })}
            disabled={game?.phase !== 'action'}
          >
            End Turn
          </button>
          <button type="button" className="secondary-button" onClick={handleResetCamera}>
            Reset Camera
          </button>
          <button type="button" className="secondary-button" onClick={handleStartGame}>
            {game ? 'Restart Game' : 'Start Game'}
          </button>
        </div>

        {game && (
          <div className="resource-strip" aria-label="Player resources">
            {game.players.map((player) => (
              <div
                className={player.id === game.currentPlayerId ? 'player-state active' : 'player-state'}
                key={player.id}
              >
                <strong>{player.name}</strong>
                <span>
                  {Object.entries(player.resources)
                    .map(([resource, count]) => `${resource}: ${count}`)
                    .join(' | ')}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

export default App;
