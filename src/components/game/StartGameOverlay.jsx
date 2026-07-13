const PLAYER_COUNT_OPTIONS = [3, 4];

function StartGameOverlay({
  selectedPlayers,
  confirmedPlayers,
  onSelectPlayers,
  onConfirm,
  onStart,
  onClaimSeat,
  lobbyState = null,
  localParticipant = null,
  isHost = false,
  canStartGame = false,
}) {
  const connected = Boolean(localParticipant?.connected);
  const allSeatsReady = Boolean(lobbyState?.seats.length) && lobbyState.seats.every((seat) => seat.claimedBy && seat.connected);
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
          disabled={!isHost}
        >
          {PLAYER_COUNT_OPTIONS.map((count) => (
            <option key={count} value={count}>{count} players</option>
          ))}
        </select>
        <button type="submit" className="secondary-button" data-testid="set-players" disabled={!isHost}>Set Players</button>
        <button type="button" data-testid="start-game" onClick={onStart} disabled={!confirmedPlayers || !canStartGame}>
          Start Game
        </button>
      </form>
      <p className="helper-text" data-testid="player-setup-helper">
        {confirmedPlayers
          ? `Players ready: ${confirmedPlayers}. ${allSeatsReady ? 'All seats connected.' : 'Waiting for seats to be claimed.'}`
          : `Current selection: ${selectedPlayers} players`}
      </p>
      {lobbyState && (
        <div className="seat-lobby" aria-label="Seat lobby" data-testid="seat-lobby">
          <p className="status-label">Seats</p>
          {lobbyState.seats.map((seat) => {
            const claimedByMe = seat.claimedBy === localParticipant?.participantId;
            const available = connected && (!seat.claimedBy || claimedByMe) && lobbyState.room.status === 'lobby';
            return (
              <button
                key={seat.playerId}
                type="button"
                className={claimedByMe ? 'seat-button seat-button-owned' : 'seat-button'}
                onClick={() => onClaimSeat?.(seat.playerId)}
                disabled={!available}
                data-testid={`claim-seat-${seat.playerId}`}
                style={{ '--seat-color': seat.color }}
              >
                <span>{seat.label}</span>
                <strong>{seat.displayName || (seat.claimedBy ? 'Claimed' : 'Open')}</strong>
                {seat.claimedBy && <small>{seat.connected ? 'connected' : 'disconnected'}</small>}
              </button>
            );
          })}
          {lobbyState.room.status === 'active' && (
            <p className="helper-text">Game already started. New visitors are spectators.</p>
          )}
        </div>
      )}
      {!connected && <p className="helper-text">Join the table call to claim a color seat for multiplayer.</p>}
    </div>
  );
}

export default StartGameOverlay;
