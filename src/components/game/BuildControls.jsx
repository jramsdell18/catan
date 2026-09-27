import { useEffect, useRef, useState } from 'react';
import { INTERACTION_MODES, buildControlLabels } from '../../game/interactions.js';
import { RESOURCE_DISPLAY } from '../../game/resourceDisplay.js';
import { CityIcon, HammerIcon, RoadIcon, SettlementIcon } from './HudIcons.jsx';

const BUILDS = [
  { kind: 'road', label: 'Build road', title: 'Road', mode: INTERACTION_MODES.PLACE_ROAD, Icon: RoadIcon },
  { kind: 'settlement', label: 'Build settlement', title: 'Settlement', mode: INTERACTION_MODES.PLACE_SETTLEMENT, Icon: SettlementIcon },
  { kind: 'city', label: 'Build city', title: 'City', mode: INTERACTION_MODES.BUILD_CITY, Icon: CityIcon },
];

function CostChips({ cost }) {
  return (
    <span className="build-cost" aria-hidden="true">
      {RESOURCE_DISPLAY.filter((resource) => cost[resource.id]).map((resource) => (
        <span key={resource.id} title={resource.label}>{resource.icon}{cost[resource.id] > 1 ? `×${cost[resource.id]}` : ''}</span>
      ))}
    </span>
  );
}

/**
 * One "Build" button that expands into a small menu. Only builds the player can
 * make right now are buttons; the rest are listed as plain cost reminders, so
 * there is never a row of disabled controls.
 */
function BuildControls({ interactionMode, buildAvailability, onSelectMode }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const availableCount = BUILDS.filter((build) => buildAvailability[build.kind].enabled).length;

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (event.type === 'keydown' ? event.key === 'Escape' : !menuRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div className="build-menu-anchor" ref={menuRef}>
      <button
        type="button"
        className={`hud-icon-button hud-labeled build-toggle${open ? ' selected' : ''}`}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`Build (${availableCount} available)`}
        title="Build"
        data-testid="toggle-build"
      >
        <HammerIcon />
        <span className="hud-caption" aria-hidden="true">Build</span>
        {availableCount > 0 && <span className="hud-badge" aria-hidden="true">{availableCount}</span>}
      </button>
      {open && (
        <div className="build-menu hud-card" role="group" aria-label="Build options" data-testid="build-menu">
          {BUILDS.map(({ kind, label, title, mode, Icon }) => {
            const availability = buildAvailability[kind];
            const { name, hint } = buildControlLabels(label, availability);
            if (!availability.enabled) {
              return (
                <p key={kind} className="build-need" data-testid={`build-need-${kind}`} title={hint}>
                  <span className="build-need-icon" aria-hidden="true"><Icon size={18} /></span>
                  <span>{title}</span>
                  <CostChips cost={availability.cost} />
                  <span className="visually-hidden">{hint}</span>
                </p>
              );
            }
            return (
              <button
                key={kind}
                type="button"
                className={`build-option${interactionMode === mode ? ' selected' : ''}`}
                data-testid={`build-${kind}`}
                onClick={() => { setOpen(false); onSelectMode(mode); }}
                title={hint}
                aria-label={name}
              >
                <span className={`build-icon build-icon-${kind}`}><Icon /></span>
                <span aria-hidden="true">{title}</span>
                <CostChips cost={availability.cost} />
              </button>
            );
          })}
          {availableCount === 0 && <p className="build-empty">Nothing to build yet. Trade or collect more cards.</p>}
        </div>
      )}
    </div>
  );
}

export default BuildControls;
