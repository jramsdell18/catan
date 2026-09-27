import BuildControls from './BuildControls.jsx';
import ResourceStrip from './ResourceStrip.jsx';
import RobberWorkflow from './RobberWorkflow.jsx';
import TurnSummary from './TurnSummary.jsx';
import TradeControls from './TradeControls.jsx';
import DevelopmentControls from './DevelopmentControls.jsx';
import GameToasts from './GameToasts.jsx';
import { DiceIcon, EndTurnIcon } from './HudIcons.jsx';

/**
 * Board-first overlay with as few controls as possible:
 * - top: one-line prompt saying what to do now, with toasts under it;
 * - bottom: hand-count and resource chips, then only the actions that make
 *   sense right now, ending in ONE highlighted primary action
 *   (Roll dice / End turn / Cancel). Everything rare lives in the settings gear.
 */
function PrimaryAction({ game, isViewerTurn, requestedMode, onCancelInteraction, onRollDice, onEndTurn }) {
  if (!game || !isViewerTurn) return null;
  // Road Building has its own floating progress bar with Build / Cancel.
  if (requestedMode === 'roadBuilding') return null;
  if (requestedMode) {
    return (
      <button type="button" className="hud-pill hud-pill-secondary" onClick={onCancelInteraction} data-testid="cancel-interaction">
        Cancel
      </button>
    );
  }
  if (game.phase === 'roll') {
    return (
      <button type="button" className="hud-pill hud-pill-primary is-attention" onClick={onRollDice} data-testid="roll-dice" aria-label="Roll dice">
        <DiceIcon size={24} />
        <span aria-hidden="true">Roll dice</span>
      </button>
    );
  }
  if (game.phase === 'action') {
    return (
      <button type="button" className="hud-pill hud-pill-primary" onClick={onEndTurn} data-testid="end-turn" aria-label="End turn">
        <EndTurnIcon size={22} />
        <span aria-hidden="true">End turn</span>
      </button>
    );
  }
  return null;
}

function GameControlPanel(props) {
  const { game, playerView = null, viewerId = null, sharedDeviceMode = true, isViewerTurn } = props;
  const actionPhase = game?.phase === 'action';
  const showBuild = actionPhase && isViewerTurn && !props.requestedMode;
  return (
    <section className={`board-hud${game ? '' : ' is-pregame'}`} aria-label="Game controls">
      <div className="hud-top">
        <div className="hud-top-center">
          <TurnSummary {...props} />
          {/* Toasts stack under the prompt so they never cover the action buttons. */}
          <GameToasts toasts={props.toasts ?? []} onDone={props.onDismissToast} />
        </div>
      </div>

      <div className="hud-sheet-slot">
        <RobberWorkflow
          game={game}
          playerView={playerView}
          viewerId={viewerId}
          sharedDeviceMode={sharedDeviceMode}
          selectedTileId={props.selectedRobberTileId}
          eligibleVictims={props.eligibleRobberVictims}
          onDiscard={props.onDiscard}
          onSelectVictim={props.onSelectVictim}
          onChooseDifferentHex={props.onChooseDifferentRobberHex}
        />
      </div>

      <div className="hud-bottom">
        <ResourceStrip game={game} playerView={playerView} />
        <div className="hud-actions" role="toolbar" aria-label="Turn actions">
          {showBuild && (
            <BuildControls
              interactionMode={props.interactionMode}
              buildAvailability={props.buildAvailability}
              onSelectMode={props.onSelectMode}
            />
          )}
          {isViewerTurn && (
            <DevelopmentControls
              game={game}
              playerView={playerView}
              onAction={props.onDevelopmentAction}
              onBeginRoadBuilding={props.onBeginRoadBuilding}
              selectedRoadCount={props.selectedRoadBuildingEdges.length}
              onFinishRoadBuilding={props.onFinishRoadBuilding}
              onCancelRoadBuilding={props.onCancelRoadBuilding}
              interactionMode={props.interactionMode}
            />
          )}
          <TradeControls
            game={game}
            playerView={playerView}
            viewerId={viewerId}
            sharedDeviceMode={sharedDeviceMode}
            isViewerTurn={isViewerTurn && !props.requestedMode}
            onAction={props.onTradeAction}
          />
          <PrimaryAction
            game={game}
            isViewerTurn={isViewerTurn}
            requestedMode={props.requestedMode}
            onCancelInteraction={props.onCancelInteraction}
            onRollDice={props.onRollDice}
            onEndTurn={props.onEndTurn}
          />
        </div>
      </div>
    </section>
  );
}

export default GameControlPanel;
