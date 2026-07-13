import { useState } from 'react';
import { BUILDING_COSTS, RESOURCE_TYPES } from '../../rules/index.js';
import { canAfford, formatCost } from '../../game/interactions.js';

const CARD_LABELS = {
  knight: 'Knight',
  victoryPoint: 'Victory Point',
  roadBuilding: 'Road Building',
  yearOfPlenty: 'Year of Plenty',
  monopoly: 'Monopoly',
};

function DevelopmentControls({
  game,
  playerView,
  onAction,
  onBeginRoadBuilding,
  selectedRoadCount,
  onFinishRoadBuilding,
  onCancelRoadBuilding,
}) {
  const [open, setOpen] = useState(false);
  const [plentyResources, setPlentyResources] = useState(['wood', 'brick']);
  const [monopolyResource, setMonopolyResource] = useState('wood');
  if (!game || (game.phase !== 'roll' && game.phase !== 'action')) return null;

  const player = game.players.find((item) => item.id === game.currentPlayerId);
  const privatePlayer = playerView?.players.find((item) => item.isSelf) ?? player;
  const cards = privatePlayer.developmentCards ?? [];
  const canBuy = game.phase === 'action'
    && game.developmentDeck.length > 0
    && canAfford(player.resources, BUILDING_COSTS.development);

  function canPlay(card) {
    return card.type !== 'victoryPoint'
      && card.boughtTurn !== game.turnIndex
      && !game.playedDevelopmentThisTurn;
  }

  return (
    <section className="development-panel" aria-labelledby="development-title" data-testid="development-controls">
      <button type="button" className="secondary-button development-toggle" onClick={() => setOpen((value) => !value)} data-testid="toggle-development">
        {open ? 'Hide development cards' : `Development cards (${cards.length})`}
      </button>
      {open && (
        <div className="development-content">
          <p className="status-label" id="development-title">Development cards</p>
          <button
            type="button"
            onClick={() => onAction({ type: 'buyDevelopment', playerId: game.currentPlayerId })}
            disabled={!canBuy}
            data-testid="buy-development"
          >
            Buy card · {formatCost(BUILDING_COSTS.development)} · {game.developmentDeck.length} left
          </button>
          <p className="development-help">Only the active player’s card types are shown. Cards bought this turn are locked.</p>
          <div className="development-hand">
            {cards.length === 0 && <p>No development cards.</p>}
            {cards.map((card, index) => {
              const playable = canPlay(card);
              return (
                <article className="development-card" key={`${card.type}-${card.boughtTurn}-${index}`} data-testid={`development-card-${card.type}`}>
                  <strong>{CARD_LABELS[card.type] ?? card.type}</strong>
                  {card.type === 'victoryPoint' && <span>Private victory point</span>}
                  {card.boughtTurn === game.turnIndex && <span>Bought this turn</span>}
                  {card.type === 'knight' && <button type="button" disabled={!playable} onClick={() => onAction({ type: 'playDevelopment', playerId: game.currentPlayerId, card: 'knight' })}>Play Knight</button>}
                  {card.type === 'yearOfPlenty' && (
                    <>
                      <div className="development-selectors">
                        {[0, 1].map((slot) => (
                          <select key={slot} value={plentyResources[slot]} onChange={(event) => setPlentyResources((current) => current.map((value, item) => item === slot ? event.target.value : value))} aria-label={`Year of Plenty resource ${slot + 1}`}>
                            {RESOURCE_TYPES.map((resource) => <option key={resource}>{resource}</option>)}
                          </select>
                        ))}
                      </div>
                      <button type="button" disabled={!playable || plentyResources.some((resource) => game.bank[resource] < plentyResources.filter((item) => item === resource).length)} onClick={() => onAction({ type: 'playDevelopment', playerId: game.currentPlayerId, card: 'yearOfPlenty', resources: plentyResources })}>Play Year of Plenty</button>
                    </>
                  )}
                  {card.type === 'monopoly' && (
                    <>
                      <select value={monopolyResource} onChange={(event) => setMonopolyResource(event.target.value)} aria-label="Monopoly resource">
                        {RESOURCE_TYPES.map((resource) => <option key={resource}>{resource}</option>)}
                      </select>
                      <button type="button" disabled={!playable} onClick={() => onAction({ type: 'playDevelopment', playerId: game.currentPlayerId, card: 'monopoly', resource: monopolyResource })}>Play Monopoly</button>
                    </>
                  )}
                  {card.type === 'roadBuilding' && <button type="button" disabled={!playable || player.pieces.roads < 1} onClick={onBeginRoadBuilding}>Play Road Building</button>}
                </article>
              );
            })}
          </div>
          {selectedRoadCount > 0 && (
            <div className="road-building-progress" data-testid="road-building-progress">
              <strong>{selectedRoadCount}/2 free roads selected</strong>
              <button type="button" onClick={onFinishRoadBuilding}>Build selected road{selectedRoadCount === 1 ? '' : 's'}</button>
              <button type="button" className="secondary-button" onClick={onCancelRoadBuilding}>Cancel</button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default DevelopmentControls;
