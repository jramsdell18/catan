import { useMemo, useState } from 'react';
import BoardPreview from './components/BoardPreview.jsx';
import PlayerSetup from './components/PlayerSetup.jsx';

const DEFAULT_PLAYER_COUNT = 4;

function App() {
  const [selectedPlayers, setSelectedPlayers] = useState(DEFAULT_PLAYER_COUNT);
  const [confirmedPlayers, setConfirmedPlayers] = useState(null);

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

  return (
    <main className="app-shell">
      <section className="setup-section" aria-labelledby="setup-title">
        <div className="setup-copy">
          <p className="eyebrow">Catan Multiplayer</p>
          <h1 id="setup-title">Create a game room</h1>
          <p className="intro">
            Pick the number of players for the first setup step. This starter is ready to grow into
            a shared lobby, board state, and mobile-friendly game screen.
          </p>
        </div>

        <PlayerSetup
          selectedPlayers={selectedPlayers}
          confirmedPlayers={confirmedPlayers}
          onChangePlayers={setSelectedPlayers}
          onConfirm={handleConfirm}
        />
      </section>

      <section className="game-space" aria-live="polite" aria-label="Current game setup">
        <BoardPreview />

        <div className="status-panel">
          <p className="status-label">Room setup</p>
          <p className="status-message">{playerMessage}</p>
        </div>
      </section>
    </main>
  );
}

export default App;
