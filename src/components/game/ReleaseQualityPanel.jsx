import { useState } from 'react';

const BUILD_COSTS = [
  ['Road', '1 wood + 1 brick'],
  ['Settlement', '1 wood + 1 brick + 1 hay + 1 sheep'],
  ['City', '3 ore + 2 hay'],
  ['Development card', '1 ore + 1 hay + 1 sheep'],
];

function RulesHelp() {
  return (
    <details className="rules-help" data-testid="rules-help">
      <summary>Rules help & build costs</summary>
      <div className="rules-help-content">
        <section>
          <h3>Turn guide</h3>
          <ol>
            <li>Roll the dice and resolve production or the robber.</li>
            <li>Build, trade, or play one development card in any order.</li>
            <li>End your turn. The first player to 10 points wins.</li>
          </ol>
        </section>
        <section>
          <h3>Build costs</h3>
          <dl className="cost-reference">
            {BUILD_COSTS.map(([name, cost]) => <div key={name}><dt>{name}</dt><dd>{cost}</dd></div>)}
          </dl>
        </section>
        <section>
          <h3>Key rules</h3>
          <p>Settlements must be at least two intersections apart. Cities upgrade your settlements. A 7 causes large hands to discard, then the robber moves. Ports improve maritime trade ratios.</p>
        </section>
      </div>
    </details>
  );
}

function DevelopmentTestControls({ game, boardSeed, onLoadBoard, onRollDice }) {
  const [seed, setSeed] = useState(String(boardSeed));
  const [dice, setDice] = useState([3, 4]);

  return (
    <details className="test-controls" data-testid="development-test-controls">
      <summary>Development test controls</summary>
      <div className="test-control-grid">
        <label>Board seed<input type="number" value={seed} onChange={(event) => setSeed(event.target.value)} /></label>
        <button type="button" className="secondary-button" onClick={() => onLoadBoard(Number(seed))}>Load deterministic board</button>
        <label>Die one<input type="number" min="1" max="6" value={dice[0]} onChange={(event) => setDice([Number(event.target.value), dice[1]])} /></label>
        <label>Die two<input type="number" min="1" max="6" value={dice[1]} onChange={(event) => setDice([dice[0], Number(event.target.value)])} /></label>
        <button type="button" disabled={game?.phase !== 'roll' || dice.some((value) => value < 1 || value > 6)} onClick={() => onRollDice(dice)}>Roll chosen dice</button>
      </div>
    </details>
  );
}

export { DevelopmentTestControls, RulesHelp };
