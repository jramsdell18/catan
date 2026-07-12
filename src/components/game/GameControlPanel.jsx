import ActionHistory from './ActionHistory.jsx';
import BuildControls from './BuildControls.jsx';
import ResourceStrip from './ResourceStrip.jsx';
import TableMeta from './TableMeta.jsx';
import TurnSummary from './TurnSummary.jsx';

function GameControlPanel(props) {
  const { game } = props;
  const actionPhase = game?.phase === 'action';
  return (
    <section className="game-control-panel" aria-label="Game controls">
      <TurnSummary {...props} />
      <div className="control-actions">
        <button type="button" data-testid="roll-dice" onClick={props.onRollDice} disabled={game?.phase !== 'roll'}>Roll Dice</button>
        <button type="button" data-testid="end-turn" onClick={props.onEndTurn} disabled={!actionPhase}>End Turn</button>
        {actionPhase && (
          <BuildControls
            interactionMode={props.interactionMode}
            buildAvailability={props.buildAvailability}
            onSelectMode={props.onSelectMode}
          />
        )}
        <button type="button" className="secondary-button" data-testid="reset-camera" onClick={props.onResetCamera}>Reset Camera</button>
        <button
          type="button"
          className="secondary-button"
          data-testid={game ? 'restart-game' : 'start-game-bottom'}
          onClick={props.onStartGame}
          disabled={!props.confirmedPlayers}
        >
          {game ? 'Restart Game' : 'Start Game'}
        </button>
      </div>
      <TableMeta game={game} boardSeed={props.boardSeed} currentPlayer={props.currentPlayer} totalCards={props.totalCards} />
      <ResourceStrip game={game} />
      <ActionHistory game={game} />
    </section>
  );
}

export default GameControlPanel;
