function TableMeta({ game, boardSeed, currentPlayer, totalCards }) {
  return (
    <div className="table-meta" aria-label="Table status">
      <div><p className="status-label">Board seed</p><p className="seed-value" data-testid="board-seed">{boardSeed}</p></div>
      {game && <div><p className="status-label">Current player</p><p className="seed-value" data-testid="current-player-label">{currentPlayer?.label}</p></div>}
      {game && <div><p className="status-label">Cards in play</p><p className="seed-value" data-testid="cards-in-play">{totalCards}</p></div>}
    </div>
  );
}

export default TableMeta;
