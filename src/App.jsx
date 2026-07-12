import { useMemo, useState } from 'react';
import CatanScene from './components/CatanScene.jsx';
import PlayerSetup from './components/PlayerSetup.jsx';
import { createRandomBoard } from './game/board.js';
import { getActivePlayers, PLAYER_PIECE_TYPES } from './game/pieces.js';

const DEFAULT_PLAYER_COUNT = 4;

function App() {
  const [selectedPlayers, setSelectedPlayers] = useState(DEFAULT_PLAYER_COUNT);
  const [confirmedPlayers, setConfirmedPlayers] = useState(null);
  const [board, setBoard] = useState(() => createRandomBoard());
  const [cameraResetKey, setCameraResetKey] = useState(0);

  const activePlayerCount = confirmedPlayers ?? selectedPlayers;
  const activePlayers = useMemo(() => getActivePlayers(activePlayerCount), [activePlayerCount]);

  const playerMessage = useMemo(() => {
    if (!confirmedPlayers) {
      return 'Choose a player count to start the room setup.';
    }

    return `${confirmedPlayers} players selected for this game.`;
  }, [confirmedPlayers]);

  function handleConfirm(event) {
    event.preventDefault();
    setConfirmedPlayers(selectedPlayers);
  }

  function handleRandomizeBoard() {
    setBoard(createRandomBoard());
  }

  function handleResetCamera() {
    setCameraResetKey((key) => key + 1);
  }

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
        </div>

        <div className="status-panel">
          <p className="status-label">Room setup</p>
          <p className="status-message">{playerMessage}</p>
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
        <CatanScene board={board} activePlayers={activePlayers} cameraResetKey={cameraResetKey} />

        <div className="board-debug">
          <div>
            <p className="status-label">Board seed</p>
            <p className="seed-value">{board.seed}</p>
          </div>
        </div>
      </section>
    </main>
  );
}

export default App;
