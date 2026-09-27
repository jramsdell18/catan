import BuildControls from './BuildControls.jsx';
import ResourceStrip from './ResourceStrip.jsx';
import RobberWorkflow from './RobberWorkflow.jsx';
import TurnSummary from './TurnSummary.jsx';
import TradeControls from './TradeControls.jsx';
import DevelopmentControls from './DevelopmentControls.jsx';
import { DevelopmentTestControls } from './ReleaseQualityPanel.jsx';
import GameToasts from './GameToasts.jsx';
import { CameraResetIcon, DiceIcon, EndTurnIcon, RestartIcon } from './HudIcons.jsx';

/**
 * Board-first overlay: the 3D table fills the screen and these controls float
 * over its edges. Containers ignore pointer events so the board stays tappable
 * between controls; anything needing room opens as a sheet over the board.
 */
function GameControlPanel(props) {
  const { game, playerView = null, viewerId = null, sharedDeviceMode = true } = props;
  const actionPhase = game?.phase === 'action';
  const rollPhase = game?.phase === 'roll';
  return (
    <section className={`board-hud${game ? '' : ' is-pregame'}`} aria-label="Game controls">
      <div className="hud-top">
        <div className="hud-top-center">
          <TurnSummary {...props} />
          {/* Toasts stack under the status card so they never cover the corner or action buttons. */}
          <GameToasts toasts={props.toasts ?? []} onDone={props.onDismissToast} />
        </div>
        <div className="hud-corner">
          <button
            type="button"
            className="hud-icon-button hud-small"
            data-testid="reset-camera"
            onClick={props.onResetCamera}
            aria-label="Reset camera"
            title="Reset camera"
          >
            <CameraResetIcon />
          </button>
          {game && (
            <button
              type="button"
              className="hud-icon-button hud-small"
              data-testid="restart-game"
              onClick={props.onStartGame}
              disabled={!props.isHost}
              aria-label="Restart Game"
              title="Restart Game"
            >
              <RestartIcon />
              <span className="visually-hidden">Restart Game</span>
            </button>
          )}
          {import.meta.env.DEV && (
            <DevelopmentTestControls
              game={game}
              boardSeed={props.boardSeed}
              simulateOpponents={props.simulateOpponents}
              onToggleSimulation={props.onToggleSimulation}
              onLoadBoard={props.onLoadTestBoard}
              onRollDice={props.onRollChosenDice}
            />
          )}
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
          {actionPhase && props.isViewerTurn && (
            <BuildControls
              interactionMode={props.interactionMode}
              buildAvailability={props.buildAvailability}
              onSelectMode={props.onSelectMode}
            />
          )}
          {props.isViewerTurn && (
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
            isViewerTurn={props.isViewerTurn}
            onAction={props.onTradeAction}
          />
          <button
            type="button"
            className="hud-icon-button hud-labeled"
            data-testid="end-turn"
            onClick={props.onEndTurn}
            disabled={!actionPhase || !props.isViewerTurn}
            hidden={Boolean(game) && !actionPhase}
            aria-label="End turn"
            title="End turn"
          >
            <EndTurnIcon />
            <span className="hud-caption" aria-hidden="true">End</span>
          </button>
          <button
            type="button"
            className="hud-icon-button hud-labeled hud-primary"
            data-testid="roll-dice"
            onClick={props.onRollDice}
            disabled={!rollPhase || !props.isViewerTurn}
            hidden={Boolean(game) && !rollPhase}
            aria-label="Roll dice"
            title="Roll dice"
          >
            <DiceIcon />
            <span className="hud-caption" aria-hidden="true">Roll</span>
          </button>
        </div>
      </div>
    </section>
  );
}

export default GameControlPanel;
