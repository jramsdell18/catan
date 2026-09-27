import { useState } from 'react';
import { BUILDING_COSTS, RESOURCE_TYPES } from '../../rules/index.js';
import { canAfford, formatCost, INTERACTION_MODES } from '../../game/interactions.js';
import { CardsIcon } from './HudIcons.jsx';

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
  interactionMode = null,
}) {
  const [open, setOpen] = useState(false);
  const [plentyResources, setPlentyResources] = useState(['wood', 'brick']);
  const [monopolyResource, setMonopolyResource] = useState('wood');
  if (!game || (game.phase !== 'roll' && game.phase !== 'action')) return null;

  const player = game.players.find((item) => item.id === game.currentPlayerId);
  // Prefer seat view for private card list and affordability when available.
  const privatePlayer = playerView?.players.find((item) => item.isSelf && item.resources)
    ?? playerView?.players.find((item) => item.id === game.currentPlayerId && item.resources)
    ?? player;
  const cards = privatePlayer.developmentCards ?? [];
  const deckCount = playerView?.developmentDeckCount
    ?? (Array.isArray(game.developmentDeck) ? game.developmentDeck.length : 0);
  const canBuy = game.phase === 'action'
    && deckCount > 0
    && canAfford(privatePlayer.resources, BUILDING_COSTS.development);

  // While free roads are being picked on the board, the sheet steps aside.
  const roadBuildingActive = interactionMode === INTERACTION_MODES.ROAD_BUILDING;

  // Only show the cards button when there is something to do with it.
  if (!open && !roadBuildingActive && cards.length === 0 && !canBuy) return null;

  function canPlay(card) {
    return card.type !== 'victoryPoint'
      && card.boughtTurn !== game.turnIndex
      && !game.playedDevelopmentThisTurn;
  }

  return (
    <>
      <button
        type="button"
        className={`hud-icon-button hud-labeled development-toggle${open ? ' selected' : ''}`}
        onClick={() => setOpen((value) => !value)}
        aria-label={`Development cards (${cards.length})`}
        aria-expanded={open}
        title="Development cards"
        data-testid="toggle-development"
      >
        <CardsIcon />
        <span className="hud-caption" aria-hidden="true">Cards</span>
        {cards.length > 0 && <span className="hud-badge" aria-hidden="true">{cards.length}</span>}
      </button>
      {roadBuildingActive && (
        <div className="road-building-progress hud-card" data-testid="road-building-progress">
          <strong>{selectedRoadCount}/2 free roads selected</strong>
          {selectedRoadCount > 0 && (
            <button type="button" onClick={onFinishRoadBuilding}>Build selected road{selectedRoadCount === 1 ? '' : 's'}</button>
          )}
          <button type="button" className="secondary-button" onClick={onCancelRoadBuilding}>Cancel</button>
        </div>
      )}
      {open && !roadBuildingActive && (
        <div className="board-sheet-backdrop">
        <section className="board-sheet development-panel" role="dialog" aria-modal="true" aria-labelledby="development-title" data-testid="development-controls">
          <header className="board-sheet-header">
            <h2 id="development-title">Development cards</h2>
            <button type="button" className="sheet-close" onClick={() => setOpen(false)} aria-label="Close development cards" data-testid="close-development">×</button>
          </header>
          <div className="board-sheet-body development-content">
          <button
            type="button"
            onClick={() => onAction({ type: 'buyDevelopment', playerId: game.currentPlayerId })}
            disabled={!canBuy}
            data-testid="buy-development"
          >
            Buy card · {formatCost(BUILDING_COSTS.development)} · {deckCount} left
          </button>
          <p className="development-help">
            Only the local seat’s card types are shown. Cards bought this turn are locked.
          </p>
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
          </div>
        </section>
        </div>
      )}
    </>
  );
}

export default DevelopmentControls;
