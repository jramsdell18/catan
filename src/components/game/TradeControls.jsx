import { useMemo, useState } from 'react';
import { getPlayerPortRatio, RESOURCE_TYPES } from '../../rules/index.js';

const emptyBundle = () => Object.fromEntries(RESOURCE_TYPES.map((resource) => [resource, 0]));
const bundleTotal = (bundle) => Object.values(bundle).reduce((sum, amount) => sum + amount, 0);
const bundleText = (bundle) => Object.entries(bundle).filter(([, amount]) => amount > 0).map(([resource, amount]) => `${amount} ${resource}`).join(', ');
const hasBundle = (player, bundle) => Object.entries(bundle).every(([resource, amount]) => player.resources[resource] >= amount);

function BundleEditor({ legend, bundle, onChange, limits = {} }) {
  return (
    <fieldset className="trade-bundle">
      <legend>{legend}</legend>
      {RESOURCE_TYPES.map((resource) => (
        <label key={resource}>
          <span>{resource}</span>
          <input
            type="number"
            min="0"
            max={limits[resource]}
            value={bundle[resource]}
            onChange={(event) => onChange({ ...bundle, [resource]: Math.max(0, Number(event.target.value) || 0) })}
            data-testid={`trade-${legend.toLowerCase()}-${resource}`}
          />
        </label>
      ))}
    </fieldset>
  );
}

function MaritimeTrade({ game, player, onAction }) {
  const [give, setGive] = useState('wood');
  const [receive, setReceive] = useState('brick');
  const ratio = getPlayerPortRatio(game.board, player.id, give);
  const valid = give !== receive && player.resources[give] >= ratio && game.bank[receive] > 0;
  const controlledPorts = game.board.ports.filter((port) => port.intersections.some(
    (id) => game.board.intersections[id]?.building?.playerId === player.id,
  ));

  return (
    <form
      className="maritime-trade"
      onSubmit={(event) => {
        event.preventDefault();
        onAction({ type: 'maritimeTrade', playerId: player.id, give, receive });
      }}
      data-testid="maritime-trade"
    >
      <h3>Bank and ports</h3>
      <label>Give
        <select value={give} onChange={(event) => setGive(event.target.value)} data-testid="maritime-give">
          {RESOURCE_TYPES.map((resource) => <option key={resource}>{resource}</option>)}
        </select>
      </label>
      <strong className="trade-ratio">{ratio}:1</strong>
      <label>Receive
        <select value={receive} onChange={(event) => setReceive(event.target.value)} data-testid="maritime-receive">
          {RESOURCE_TYPES.map((resource) => <option key={resource}>{resource}</option>)}
        </select>
      </label>
      <button type="submit" disabled={!valid}>Trade {ratio} for 1</button>
      <p className="trade-help">
        {controlledPorts.length
          ? `Controlled ports: ${controlledPorts.map((port) => port.resource ? `2:1 ${port.resource}` : '3:1 any').join(' · ')}`
          : 'No controlled ports; default trades are 4:1.'}
      </p>
    </form>
  );
}

function PendingTrade({ game, offer, onAction }) {
  const from = game.players.find((player) => player.id === offer.fromPlayerId);
  const responders = game.players.filter((player) =>
    player.id !== offer.fromPlayerId && (!offer.toPlayerId || player.id === offer.toPlayerId),
  );
  return (
    <div className="pending-trade" data-testid="pending-trade">
      <h3>Pending offer from {from.name}</h3>
      <p>Offers {bundleText(offer.give)} for {bundleText(offer.receive)}.</p>
      {responders.map((player) => (
        <div className="trade-response" key={player.id}>
          <strong>{player.name}</strong>
          <button
            type="button"
            disabled={!hasBundle(player, offer.receive) || !hasBundle(from, offer.give)}
            onClick={() => onAction({ type: 'acceptTrade', playerId: player.id })}
            data-testid={`accept-trade-${player.id}`}
          >
            Accept
          </button>
          <button type="button" className="secondary-button" onClick={() => onAction({ type: 'rejectTrade', playerId: player.id })} data-testid={`reject-trade-${player.id}`}>
            Reject
          </button>
        </div>
      ))}
      <button type="button" className="secondary-button" onClick={() => onAction({ type: 'cancelTrade', playerId: offer.fromPlayerId })} data-testid="cancel-trade">
        Cancel offer
      </button>
    </div>
  );
}

function DomesticTrade({ game, player, onAction }) {
  const [give, setGive] = useState(emptyBundle);
  const [receive, setReceive] = useState(emptyBundle);
  const [targetId, setTargetId] = useState('');
  const canOffer = bundleTotal(give) > 0 && bundleTotal(receive) > 0 && hasBundle(player, give);

  if (game.tradeOffer) return <PendingTrade game={game} offer={game.tradeOffer} onAction={onAction} />;

  return (
    <form
      className="domestic-trade"
      onSubmit={(event) => {
        event.preventDefault();
        onAction({
          type: 'offerTrade',
          playerId: player.id,
          toPlayerId: targetId || null,
          give,
          receive,
        });
      }}
      data-testid="domestic-trade"
    >
      <h3>Player trade</h3>
      <label>Offer to
        <select value={targetId} onChange={(event) => setTargetId(event.target.value)} data-testid="trade-target">
          <option value="">Any opponent</option>
          {game.players.filter((item) => item.id !== player.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <div className="trade-bundles">
        <BundleEditor legend="Give" bundle={give} onChange={setGive} limits={player.resources} />
        <BundleEditor legend="Receive" bundle={receive} onChange={setReceive} />
      </div>
      <button type="submit" disabled={!canOffer} data-testid="offer-trade">Make offer</button>
    </form>
  );
}

function TradeControls({ game, onAction }) {
  const [open, setOpen] = useState(false);
  const player = useMemo(() => game?.players.find((item) => item.id === game.currentPlayerId), [game]);
  if (!game || game.phase !== 'action' || !player) return null;
  return (
    <section className="trade-panel" aria-labelledby="trade-title" data-testid="trade-controls">
      <button type="button" className="secondary-button trade-toggle" onClick={() => setOpen((value) => !value)} data-testid="toggle-trades">
        {open ? 'Hide trades' : 'Trade resources'}
      </button>
      {open && (
        <div className="trade-content">
          <p className="status-label" id="trade-title">Trading</p>
          <MaritimeTrade game={game} player={player} onAction={onAction} />
          <DomesticTrade game={game} player={player} onAction={onAction} />
        </div>
      )}
    </section>
  );
}

export default TradeControls;
