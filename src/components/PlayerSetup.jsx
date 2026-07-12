const PLAYER_OPTIONS = [3, 4];

function PlayerSetup({ selectedPlayers, confirmedPlayers, onChangePlayers, onConfirm }) {
  return (
    <form className="setup-form" onSubmit={onConfirm} data-testid="player-setup-form">
      <label htmlFor="player-count">Number of players</label>

      <div className="player-control">
        <select
          id="player-count"
          data-testid="player-count"
          value={selectedPlayers}
          onChange={(event) => onChangePlayers(Number(event.target.value))}
        >
          {PLAYER_OPTIONS.map((count) => (
            <option key={count} value={count}>
              {count} players
            </option>
          ))}
        </select>

        <button type="submit" data-testid="set-players">
          Set Players
        </button>
      </div>

      <p className="helper-text" data-testid="player-setup-helper">
        Current selection: {selectedPlayers} players
        {confirmedPlayers ? `, last confirmed: ${confirmedPlayers}` : ''}
      </p>
    </form>
  );
}

export default PlayerSetup;
