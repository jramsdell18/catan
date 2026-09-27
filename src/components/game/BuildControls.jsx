import { INTERACTION_MODES, buildControlLabels } from '../../game/interactions.js';
import { CityIcon, RoadIcon, SettlementIcon } from './HudIcons.jsx';

const BUILD_ICONS = {
  road: RoadIcon,
  settlement: SettlementIcon,
  city: CityIcon,
};

function BuildButton({ kind, label, mode, interactionMode, availability, onSelectMode }) {
  // Cost stays discoverable even though the visible control is an icon.
  const { name, hint } = buildControlLabels(label, availability);
  const Icon = BUILD_ICONS[kind];

  return (
    <button
      type="button"
      className={interactionMode === mode ? 'hud-icon-button build-button selected' : 'hud-icon-button build-button'}
      data-testid={`build-${kind}`}
      onClick={() => onSelectMode(mode)}
      disabled={!availability.enabled}
      title={hint}
      aria-label={name}
    >
      <span className={`build-icon build-icon-${kind}`}><Icon /></span>
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
