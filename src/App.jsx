import { useCallback, useMemo, useState } from 'react';
import CatanScene from './components/CatanScene.jsx';
import PlayerSetup from './components/PlayerSetup.jsx';
import { createRandomBoard } from './game/board.js';
import { createPlayerInventories, getActivePlayers, PLAYER_PIECE_TYPES } from './game/pieces.js';
import { createStartingResourceCards } from './game/resources.js';
import {
  createSetupOrder,
  getCurrentSetupTurn,
  getSetupProgress,
  pickRandomStartingSeat,
} from './game/setupFlow.js';
import {
  createBoardTopology,
  getAllowedRoadEdges,
  getAllowedSettlementVertices,
} from './game/topology.js';

const DEFAULT_PLAYER_COUNT = 4;

function App() {
  const [selectedPlayers, setSelectedPlayers] = useState(DEFAULT_PLAYER_COUNT);
  const [confirmedPlayers, setConfirmedPlayers] = useState(null);
  const [board, setBoard] = useState(() => createRandomBoard());
  const [cameraResetKey, setCameraResetKey] = useState(0);
  const [setup, setSetup] = useState(null);
  const [placements, setPlacements] = useState({ settlements: [], roads: [] });
  const [pendingSettlementVertexId, setPendingSettlementVertexId] = useState(null);

  const activePlayerCount = confirmedPlayers ?? selectedPlayers;
  const activePlayers = useMemo(() => getActivePlayers(activePlayerCount), [activePlayerCount]);
  const topology = useMemo(() => createBoardTopology(board.hexes), [board.hexes]);
  const resourceHands = useMemo(
    () => createStartingResourceCards(activePlayers, topology, placements, setup?.status),
    [activePlayers, placements, setup?.status, topology],
  );
  const playerInventories = useMemo(
    () => createPlayerInventories(activePlayers, placements),
    [activePlayers, placements],
  );
  const currentSetupTurn = useMemo(() => getCurrentSetupTurn(setup), [setup]);
  const setupProgress = useMemo(() => getSetupProgress(setup), [setup]);
  const activeSetupPlayer = useMemo(() => {
    if (!currentSetupTurn) {
      return null;
    }

    return activePlayers.find((player) => player.id === currentSetupTurn.playerId) ?? null;
  }, [activePlayers, currentSetupTurn]);

  const playerMessage = useMemo(() => {
    if (setup?.status === 'complete') {
      return 'Setup complete. Starting resource cards were dealt from each second settlement.';
    }

    if (activeSetupPlayer && setup?.status === 'placing') {
      const piece = setup.phase === 'settlement' ? 'settlement' : 'road';
      return `${activeSetupPlayer.label} places a ${piece} now.`;
    }

    if (!confirmedPlayers) {
      return 'Choose a player count to start the room setup.';
    }

    return `${confirmedPlayers} players selected. Start the game to choose the first player.`;
  }, [activeSetupPlayer, confirmedPlayers, setup]);

  const placementOptions = useMemo(() => {
    if (!setup || setup.status !== 'placing') {
      return { settlements: [], roads: [] };
    }

    if (setup.phase === 'settlement') {
      return {
        settlements: getAllowedSettlementVertices(topology, placements),
        roads: [],
      };
    }

    if (!pendingSettlementVertexId) {
      return { settlements: [], roads: [] };
    }

    return {
      settlements: [],
      roads: getAllowedRoadEdges(topology, placements, pendingSettlementVertexId),
    };
  }, [pendingSettlementVertexId, placements, setup, topology]);

  function handleConfirm(event) {
    event.preventDefault();
    setConfirmedPlayers(selectedPlayers);
    setSetup(null);
    setPlacements({ settlements: [], roads: [] });
    setPendingSettlementVertexId(null);
  }

  function handleRandomizeBoard() {
    setBoard(createRandomBoard());
    setSetup(null);
    setPlacements({ settlements: [], roads: [] });
    setPendingSettlementVertexId(null);
  }

  function handleResetCamera() {
    setCameraResetKey((key) => key + 1);
  }

  function handleStartGame() {
    const players = getActivePlayers(confirmedPlayers ?? selectedPlayers);
    const startingSeat = pickRandomStartingSeat(players);

    setSetup({
      status: 'placing',
      order: createSetupOrder(players, startingSeat),
      turnIndex: 0,
      phase: 'settlement',
      startingSeat,
    });
    setPlacements({ settlements: [], roads: [] });
    setPendingSettlementVertexId(null);
  }

  const handlePlaceSettlement = useCallback(
    (vertexId) => {
      if (!setup || setup.status !== 'placing' || setup.phase !== 'settlement' || !currentSetupTurn) {
        return;
      }

      const isAllowed = placementOptions.settlements.some((vertex) => vertex.id === vertexId);

      if (!isAllowed) {
        return;
      }

      setPlacements((current) => ({
        ...current,
        settlements: [
          ...current.settlements,
          {
            id: `settlement-${current.settlements.length + 1}`,
            playerId: currentSetupTurn.playerId,
            vertexId,
            setupTurnId: currentSetupTurn.id,
            setupRound: currentSetupTurn.round,
          },
        ],
      }));
      setPendingSettlementVertexId(vertexId);
      setSetup((current) => ({ ...current, phase: 'road' }));
    },
    [currentSetupTurn, placementOptions.settlements, setup],
  );

  const handlePlaceRoad = useCallback(
    (edgeId) => {
      if (!setup || setup.status !== 'placing' || setup.phase !== 'road' || !currentSetupTurn) {
        return;
      }

      const isAllowed = placementOptions.roads.some((edge) => edge.id === edgeId);

      if (!isAllowed) {
        return;
      }

      setPlacements((current) => ({
        ...current,
        roads: [
          ...current.roads,
          {
            id: `road-${current.roads.length + 1}`,
            playerId: currentSetupTurn.playerId,
            edgeId,
            setupTurnId: currentSetupTurn.id,
          },
        ],
      }));

      setPendingSettlementVertexId(null);
      setSetup((current) => {
        const nextTurnIndex = current.turnIndex + 1;

        if (nextTurnIndex >= current.order.length) {
          return { ...current, status: 'complete', turnIndex: nextTurnIndex, phase: 'complete' };
        }

        return { ...current, turnIndex: nextTurnIndex, phase: 'settlement' };
      });
    },
    [currentSetupTurn, placementOptions.roads, setup],
  );

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
          <button type="button" onClick={handleRandomizeBoard}>
            Randomize Board
          </button>
          <button type="button" className="secondary-button" onClick={handleResetCamera}>
            Reset Camera
          </button>
          <button type="button" onClick={handleStartGame} disabled={!confirmedPlayers}>
            Start Game
          </button>
        </div>

        <div className="status-panel">
          <p className="status-label">Room setup</p>
          <p className="status-message">{playerMessage}</p>
          {setupProgress && (
            <p className="helper-text">
              Setup turns: {Math.min(setupProgress.completedTurns + 1, setupProgress.totalTurns)}/
              {setupProgress.totalTurns}
            </p>
          )}
        </div>

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
        />

        <div className="board-debug">
          <div>
            <p className="status-label">Board seed</p>
            <p className="seed-value">{board.seed}</p>
          </div>
          {setup?.startingSeat && (
            <div>
              <p className="status-label">First player</p>
              <p className="seed-value">Seat {setup.startingSeat}</p>
            </div>
          )}
          {setup?.status === 'complete' && (
            <div>
              <p className="status-label">Cards dealt</p>
              <p className="seed-value">
                {resourceHands.reduce((total, hand) => total + hand.cards.length, 0)}
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

export default App;
