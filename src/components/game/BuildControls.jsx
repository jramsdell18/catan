import { formatCost, INTERACTION_MODES } from '../../game/interactions.js';

function BuildButton({ kind, label, mode, interactionMode, availability, onSelectMode }) {
  return (
    <button
      type="button"
      className={interactionMode === mode ? 'secondary-button build-button selected' : 'secondary-button build-button'}
      data-testid={`build-${kind}`}
      onClick={() => onSelectMode(mode)}
      disabled={!availability.enabled}
      title={availability.reason || `Build a ${kind}`}
    >
      <strong>{label}</strong>
      <span>{formatCost(availability.cost)} · {availability.remaining} left</span>
    </button>
  );
}

function BuildControls({ interactionMode, buildAvailability, onSelectMode }) {
  return (
    <>
      <BuildButton kind="road" label="Build Road" mode={INTERACTION_MODES.PLACE_ROAD} interactionMode={interactionMode} availability={buildAvailability.road} onSelectMode={onSelectMode} />
      <BuildButton kind="settlement" label="Build Settlement" mode={INTERACTION_MODES.PLACE_SETTLEMENT} interactionMode={interactionMode} availability={buildAvailability.settlement} onSelectMode={onSelectMode} />
      <BuildButton kind="city" label="Build City" mode={INTERACTION_MODES.BUILD_CITY} interactionMode={interactionMode} availability={buildAvailability.city} onSelectMode={onSelectMode} />
    </>
  );
}

export default BuildControls;
