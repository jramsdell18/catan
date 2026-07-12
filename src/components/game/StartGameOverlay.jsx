const PLAYER_COUNT_OPTIONS = [3, 4];

function StartGameOverlay({ selectedPlayers, confirmedPlayers, onSelectPlayers, onConfirm, onStart }) {
  return (
    <div className="start-overlay" aria-labelledby="start-title">
      <p className="eyebrow">Catan Multiplayer</p>
      <h1 id="start-title">Start Game</h1>
      <form className="start-controls" onSubmit={onConfirm} data-testid="player-setup-form">
        <label htmlFor="player-count">Players</label>
        <select
          id="player-count"
          data-testid="player-count"
          value={selectedPlayers}
          onChange={(event) => onSelectPlayers(Number(event.target.value))}
        >
          {PLAYER_COUNT_OPTIONS.map((count) => (
            <option key={count} value={count}>{count} players</option>
          ))}
        </select>
        <button type="submit" className="secondary-button" data-testid="set-players">Set Players</button>
        <button type="button" data-testid="start-game" onClick={onStart} disabled={!confirmedPlayers}>
          Start Game
        </button>
      </form>
      <p className="helper-text" data-testid="player-setup-helper">
        {confirmedPlayers
          ? `Players ready: ${confirmedPlayers} (last confirmed: ${confirmedPlayers})`
          : `Current selection: ${selectedPlayers} players`}
      </p>
    </div>
  );
}

export default StartGameOverlay;
