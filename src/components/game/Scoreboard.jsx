function Scoreboard({ playerView }) {
  if (!playerView) return null;

  const playerName = (playerId) => playerView.players.find((player) => player.id === playerId)?.name ?? 'Unclaimed';

  return (
    <section className="scoreboard" aria-label="Scoreboard" data-testid="scoreboard">
      <div className="scoreboard-heading">
        <div>
          <p className="status-label">Scoreboard</p>
          <h2>Race to 10 victory points</h2>
        </div>
        <div className="award-summary" aria-label="Game awards">
          <span data-testid="longest-road-owner"><strong>Longest Road</strong> {playerName(playerView.longestRoadPlayerId)}</span>
          <span data-testid="largest-army-owner"><strong>Largest Army</strong> {playerName(playerView.largestArmyPlayerId)}</span>
        </div>
      </div>
      <div className="score-grid">
        {playerView.players.map((player) => (
          <article
            className={`score-card${player.id === playerView.currentPlayerId ? ' active' : ''}`}
            key={player.id}
            data-testid={`score-${player.id}`}
          >
            <div className="score-card-title">
              <strong>{player.name}</strong>
              <b data-testid={`score-total-${player.id}`}>{player.publicVictoryPoints} public VP</b>
            </div>
            <span>{player.score.settlements} settlements · {player.score.cities} cities</span>
            <span>Buildings: {player.score.settlementPoints + player.score.cityPoints} VP</span>
            <span>Road length: {player.score.longestRoadLength}</span>
            <span>Knights played: {player.playedKnights}</span>
            {player.score.longestRoad > 0 && <span className="award-badge">Longest Road +2</span>}
            {player.score.largestArmy > 0 && <span className="award-badge">Largest Army +2</span>}
            {player.isSelf && (
              <span className="private-score" data-testid="private-score">
                Your private total: <strong>{player.privateVictoryPoints} VP</strong>
                {player.score.victoryPointCards > 0 && ` (${player.score.victoryPointCards} hidden card${player.score.victoryPointCards === 1 ? '' : 's'})`}
              </span>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

export default Scoreboard;
