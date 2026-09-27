import { useEffect, useRef, useState } from 'react';
import { DevelopmentTestControls } from './ReleaseQualityPanel.jsx';
import { CameraResetIcon, GearIcon, RestartIcon } from './HudIcons.jsx';

const RULES_URL = 'https://www.catan.com/understand-catan/game-rules';

/**
 * Small gear in the bottom-right corner. Everything rare or secondary lives
 * here: solo bots, camera reset, restart, rules, and (dev builds only) test tools.
 */
function SettingsMenu({
  game = null,
  canUseBots = true,
  botsEnabled = false,
  onToggleBots,
  soloPlayerCount = 4,
  onSelectSoloPlayerCount,
  onStartSolo,
  onResetCamera,
  canRestart = false,
  onRestartGame,
  localTestMode = false,
  onEnableLocalTestMode = null,
  devTools = null,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (event.type === 'keydown' ? event.key === 'Escape' : !rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const run = (callback) => () => { setOpen(false); callback?.(); };

  return (
    <div className="settings-widget" ref={rootRef}>
      {open && (
        <div className="settings-menu hud-card" role="dialog" aria-label="Settings" data-testid="settings-menu">
          {canUseBots && (
            <section className="settings-section" aria-label="Solo play">
              <p className="settings-heading">Solo play</p>
              <label className="settings-switch">
                <span>
                  <strong>Bots</strong>
                  <small>{botsEnabled ? 'On: other seats are bots' : 'Off: play with friends'}</small>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={botsEnabled}
                  aria-label="Bots"
                  className={`switch${botsEnabled ? ' is-on' : ''}`}
                  onClick={() => onToggleBots?.(!botsEnabled)}
                  data-testid="settings-bots"
                >
                  <span className="switch-knob" aria-hidden="true" />
                </button>
              </label>
              {!game && (
                <div className="settings-row">
                  <div className="segmented" role="group" aria-label="Solo players">
                    {[3, 4].map((count) => (
                      <button
                        key={count}
                        type="button"
                        aria-pressed={soloPlayerCount === count}
                        onClick={() => onSelectSoloPlayerCount?.(count)}
                        data-testid={`settings-solo-count-${count}`}
                      >
                        {count} players
                      </button>
                    ))}
                  </div>
                  <button type="button" className="settings-primary" onClick={run(onStartSolo)} data-testid="settings-start-solo">
                    Start solo game
                  </button>
                </div>
              )}
            </section>
          )}
          <section className="settings-section" aria-label="Game">
            <p className="settings-heading">Game</p>
            <button type="button" className="settings-item" onClick={run(onResetCamera)} data-testid="reset-camera">
              <CameraResetIcon size={18} /> Reset camera
            </button>
            {game && (
              <button
                type="button"
                className="settings-item"
                onClick={run(onRestartGame)}
                disabled={!canRestart}
                data-testid="restart-game"
              >
                <RestartIcon size={18} /> Restart game
              </button>
            )}
            <a className="settings-item" href={RULES_URL} target="_blank" rel="noreferrer" data-testid="settings-rules">
              <span aria-hidden="true">?</span> How to play (rules)
            </a>
          </section>
          {import.meta.env.DEV && (
            <section className="settings-section settings-dev" aria-label="Developer">
              <p className="settings-heading">Developer</p>
              {onEnableLocalTestMode && !localTestMode && (
                <button type="button" className="settings-item" onClick={run(onEnableLocalTestMode)} data-testid="enable-local-test-mode">
                  Local test mode (all seats here)
                </button>
              )}
              {devTools && <DevelopmentTestControls {...devTools} />}
            </section>
          )}
        </div>
      )}
      <button
        type="button"
        className={`hud-icon-button hud-small settings-toggle${open ? ' selected' : ''}`}
        onClick={() => setOpen((value) => !value)}
        aria-label="Settings"
        aria-expanded={open}
        title="Settings"
        data-testid="settings-toggle"
      >
        <GearIcon />
      </button>
    </div>
  );
}

export default SettingsMenu;
