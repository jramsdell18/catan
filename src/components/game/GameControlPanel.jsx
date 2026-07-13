import ActionHistory from './ActionHistory.jsx';
import BuildControls from './BuildControls.jsx';
import ResourceStrip from './ResourceStrip.jsx';
import RobberWorkflow from './RobberWorkflow.jsx';
import RollOutcome from './RollOutcome.jsx';
import TableMeta from './TableMeta.jsx';
import TurnSummary from './TurnSummary.jsx';
import TradeControls from './TradeControls.jsx';
import DevelopmentControls from './DevelopmentControls.jsx';
import Scoreboard from './Scoreboard.jsx';

function GameControlPanel(props) {
  const { game, playerView = null } = props;
  const actionPhase = game?.phase === 'action';
  const canAct = !game || props.isViewerTurn;
  return (
    <section className="game-control-panel" aria-label="Game controls">
      <TurnSummary {...props} />
      {/* Discard forms need full hands on a shared device; keep authoritative game here. */}
      <RobberWorkflow
        game={game}
        selectedTileId={props.selectedRobberTileId}
        eligibleVictims={props.eligibleRobberVictims}
        onDiscard={props.onDiscard}
        onSelectVictim={props.onSelectVictim}
        onChooseDifferentHex={props.onChooseDifferentRobberHex}
      />
      <RollOutcome game={game} playerView={playerView} />
      {props.isViewerTurn && (
        <>
          <TradeControls game={game} onAction={props.onTradeAction} />
          <DevelopmentControls
            game={game}
            playerView={playerView}
            onAction={props.onDevelopmentAction}
            onBeginRoadBuilding={props.onBeginRoadBuilding}
            selectedRoadCount={props.selectedRoadBuildingEdges.length}
            onFinishRoadBuilding={props.onFinishRoadBuilding}
            onCancelRoadBuilding={props.onCancelRoadBuilding}
          />
        </>
      )}
      <div className="control-actions">
        <button type="button" data-testid="roll-dice" onClick={props.onRollDice} disabled={game?.phase !== 'roll' || !props.isViewerTurn}>Roll Dice</button>
        <button type="button" data-testid="end-turn" onClick={props.onEndTurn} disabled={!actionPhase || !props.isViewerTurn}>End Turn</button>
        {actionPhase && props.isViewerTurn && (
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
          disabled={game ? !props.isHost : !props.canStartGame}
        >
          {game ? 'Restart Game' : 'Start Game'}
        </button>
      </div>
      {game && !canAct && (
        <p className="helper-text" data-testid="viewer-role">
          {props.viewerRole === 'spectator' ? 'Spectating only.' : 'Waiting for your turn.'}
        </p>
      )}
      <TableMeta game={game} boardSeed={props.boardSeed} currentPlayer={props.currentPlayer} totalCards={props.totalCards} />
      <Scoreboard playerView={playerView} />
      <ResourceStrip game={game} playerView={playerView} />
      <ActionHistory game={game} />
    </section>
  );
}

export default GameControlPanel;
