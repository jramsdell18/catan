function GameOverOverlay({ playerView, onRestart, onNewGame }) {
  if (playerView?.phase !== 'gameOver') return null;
  const winner = playerView.players.find((player) => player.id === playerView.winnerId);

  return (
    <section className="game-over-overlay" role="dialog" aria-modal="true" aria-labelledby="game-over-title" data-testid="game-over">
      <p className="eyebrow">Game over</p>
      <h1 id="game-over-title">{winner?.name ?? 'A player'} wins!</h1>
      <p>The table has reached a rules-validated victory.</p>
      <div className="final-scores" aria-label="Final public scores">
        {[...playerView.players]
          .sort((a, b) => b.publicVictoryPoints - a.publicVictoryPoints)
          .map((player) => (
            <span key={player.id} data-testid={`final-score-${player.id}`}>
              <strong>{player.name}</strong> {player.publicVictoryPoints} public VP
              {player.isSelf ? ` · ${player.privateVictoryPoints} private VP` : ''}
            </span>
          ))}
      </div>
      <div className="game-over-actions">
        <button type="button" onClick={onRestart} data-testid="game-over-restart">Restart same board</button>
        <button type="button" className="secondary-button" onClick={onNewGame} data-testid="new-game">New game</button>
      </div>
    </section>
  );
}

export default GameOverOverlay;
