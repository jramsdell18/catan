import { INTERACTION_MODES } from '../../game/interactions.js';

const BUILD_ICONS = {
  road: 'R',
  settlement: 'S',
  city: 'C',
};

function BuildButton({ kind, label, mode, interactionMode, availability, onSelectMode }) {
  return (
    <button
      type="button"
      className={interactionMode === mode ? 'secondary-button build-button selected' : 'secondary-button build-button'}
      data-testid={`build-${kind}`}
      onClick={() => onSelectMode(mode)}
      disabled={!availability.enabled}
      title={availability.reason || label}
      aria-label={label}
    >
      <span className={`build-icon build-icon-${kind}`} aria-hidden="true">{BUILD_ICONS[kind]}</span>
    </button>
  );
}

function BuildControls({ interactionMode, buildAvailability, onSelectMode }) {
  return (
    <>
      <BuildButton kind="road" label="Build road" mode={INTERACTION_MODES.PLACE_ROAD} interactionMode={interactionMode} availability={buildAvailability.road} onSelectMode={onSelectMode} />
      <BuildButton kind="settlement" label="Build settlement" mode={INTERACTION_MODES.PLACE_SETTLEMENT} interactionMode={interactionMode} availability={buildAvailability.settlement} onSelectMode={onSelectMode} />
      <BuildButton kind="city" label="Build city" mode={INTERACTION_MODES.BUILD_CITY} interactionMode={interactionMode} availability={buildAvailability.city} onSelectMode={onSelectMode} />
    </>
  );
}

export default BuildControls;
