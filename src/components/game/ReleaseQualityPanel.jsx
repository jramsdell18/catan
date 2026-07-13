import { useState } from 'react';

function DevelopmentTestControls({
  game,
  boardSeed,
  simulateOpponents = false,
  onToggleSimulation,
  onLoadBoard,
  onRollDice,
}) {
  const [seed, setSeed] = useState(String(boardSeed));
  const [dice, setDice] = useState([3, 4]);

  return (
    <details className="test-controls" data-testid="development-test-controls">
      <summary>Development test controls</summary>
      <div className="test-control-grid">
        <button
          type="button"
          className={simulateOpponents ? '' : 'secondary-button'}
          disabled={!game}
          onClick={() => onToggleSimulation?.(!simulateOpponents)}
          data-testid="toggle-simulate-opponents"
        >
          {simulateOpponents ? 'Stop simulator' : 'Simulate opponents'}
        </button>
        <label>Board seed<input type="number" value={seed} onChange={(event) => setSeed(event.target.value)} /></label>
        <button type="button" className="secondary-button" onClick={() => onLoadBoard(Number(seed))}>Load deterministic board</button>
        <label>Die one<input type="number" min="1" max="6" value={dice[0]} onChange={(event) => setDice([Number(event.target.value), dice[1]])} /></label>
        <label>Die two<input type="number" min="1" max="6" value={dice[1]} onChange={(event) => setDice([dice[0], Number(event.target.value)])} /></label>
        <button type="button" disabled={game?.phase !== 'roll' || dice.some((value) => value < 1 || value > 6)} onClick={() => onRollDice(dice)}>Roll chosen dice</button>
      </div>
    </details>
  );
}

export { DevelopmentTestControls };
