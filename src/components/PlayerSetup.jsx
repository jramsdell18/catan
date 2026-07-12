const PLAYER_OPTIONS = [2, 3, 4, 5, 6];

function PlayerSetup({ selectedPlayers, confirmedPlayers, onChangePlayers, onConfirm }) {
  return (
    <form className="setup-form" onSubmit={onConfirm}>
      <label htmlFor="player-count">Number of players</label>

      <div className="player-control">
        <select
          id="player-count"
          value={selectedPlayers}
          onChange={(event) => onChangePlayers(Number(event.target.value))}
        >
          {PLAYER_OPTIONS.map((count) => (
            <option key={count} value={count}>
              {count} players
            </option>
          ))}
        </select>

        <button type="submit">Set Players</button>
      </div>

      <p className="helper-text">
        Current selection: {selectedPlayers} players
        {confirmedPlayers ? `, last confirmed: ${confirmedPlayers}` : ''}
      </p>
    </form>
  );
}

export default PlayerSetup;
