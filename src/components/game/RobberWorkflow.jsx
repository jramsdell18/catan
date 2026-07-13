import { useEffect, useState } from 'react';
import { RESOURCE_TYPES } from '../../rules/index.js';

const emptySelection = () => Object.fromEntries(RESOURCE_TYPES.map((resource) => [resource, 0]));

function DiscardForm({ player, required, onDiscard }) {
  const [selection, setSelection] = useState(emptySelection);
  const selectedTotal = Object.values(selection).reduce((sum, amount) => sum + amount, 0);

  useEffect(() => setSelection(emptySelection()), [player.id, required]);

  function adjust(resource, change) {
    setSelection((current) => {
      const nextAmount = Math.max(0, Math.min(player.resources[resource], current[resource] + change));
      if (change > 0 && selectedTotal >= required) return current;
      return { ...current, [resource]: nextAmount };
    });
  }

  return (
    <form
      className="discard-form"
      onSubmit={(event) => {
        event.preventDefault();
        onDiscard(player.id, selection);
      }}
      data-testid={`discard-form-${player.id}`}
    >
      <strong>
        {player.name}: choose {required} cards
      </strong>
      <div className="discard-resources">
        {RESOURCE_TYPES.map((resource) => (
          <div className="discard-resource" key={resource}>
            <span>
              {resource} ({player.resources[resource]})
            </span>
            <div>
              <button
                type="button"
                className="secondary-button"
                onClick={() => adjust(resource, -1)}
                aria-label={`Remove ${resource}`}
              >
                −
              </button>
              <output>{selection[resource]}</output>
              <button type="button" onClick={() => adjust(resource, 1)} aria-label={`Add ${resource}`}>
                +
              </button>
            </div>
          </div>
        ))}
      </div>
      <button type="submit" disabled={selectedTotal !== required}>
        Discard {selectedTotal}/{required}
      </button>
    </form>
  );
}

/**
 * @param {object} props
 * @param {object} props.game full engine state (for actions / legal victims)
 * @param {object|null} [props.playerView] seat-scoped view
 * @param {string|null} [props.viewerId] local seat id
 * @param {boolean} [props.sharedDeviceMode] when true (default local hot-seat), every pending
 *   discarder can fill a form (uses full engine hands). When false (multiplayer client),
 *   only the local viewer sees a private discard form.
 */
function RobberWorkflow({
  game,
  playerView = null,
  viewerId = null,
  sharedDeviceMode = true,
  selectedTileId,
  eligibleVictims,
  onDiscard,
  onSelectVictim,
  onChooseDifferentHex,
}) {
  if (!game || (game.phase !== 'discard' && game.phase !== 'robber')) return null;

  const activeViewerId = viewerId ?? playerView?.viewerId ?? game.currentPlayerId;

  if (game.phase === 'discard') {
    return (
      <section className="required-action-panel" aria-labelledby="discard-title" data-testid="discard-workflow">
        <p className="status-label" id="discard-title">
          Required discards
        </p>
        <p>Each listed player must discard half their cards before the robber can move.</p>
        {Object.entries(game.pendingDiscards).map(([playerId, required]) => {
          const publicPlayer = game.players.find((player) => player.id === playerId);
          const isViewer = playerId === activeViewerId;
          const showPrivateForm = sharedDeviceMode || isViewer;

          if (showPrivateForm) {
            // Multiplayer client: prefer seat view. Shared device: full engine hand for that seat.
            const privatePlayer = !sharedDeviceMode && isViewer
              ? (playerView?.players.find((player) => player.id === playerId && player.resources) ?? publicPlayer)
              : publicPlayer;
            return (
              <DiscardForm
                key={playerId}
                player={privatePlayer}
                required={required}
                onDiscard={onDiscard}
              />
            );
          }

          return (
            <p
              key={playerId}
              className="discard-waiting"
              data-testid={`discard-waiting-${playerId}`}
              data-private="true"
            >
              Waiting for <strong>{publicPlayer?.name ?? playerId}</strong> to discard {required} cards
              (hand private).
            </p>
          );
        })}
      </section>
    );
  }

  return (
    <section className="required-action-panel" aria-labelledby="robber-title" data-testid="robber-workflow">
      <p className="status-label" id="robber-title">
        Move robber
      </p>
      {!selectedTileId && <p>Select any highlighted hex other than the robber’s current hex.</p>}
      {selectedTileId && eligibleVictims.length > 0 && (
        <>
          <p>Choose one adjacent player to rob. The stolen resource remains private.</p>
          <div className="victim-actions">
            {eligibleVictims.map((player) => (
              <button
                type="button"
                key={player.id}
                onClick={() => onSelectVictim(player.id)}
                data-testid={`rob-victim-${player.id}`}
              >
                Rob {player.name}
              </button>
            ))}
            <button type="button" className="secondary-button" onClick={onChooseDifferentHex}>
              Choose another hex
            </button>
          </div>
        </>
      )}
    </section>
  );
}

export default RobberWorkflow;
