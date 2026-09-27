import { useEffect, useMemo, useState } from 'react';
import { getPlayerPortRatio } from '../../rules/index.js';
import { formatBundle, handCount, RESOURCE_DISPLAY } from '../../game/resourceDisplay.js';

const MAX_REQUEST_PER_RESOURCE = 19;
const emptyBundle = () => Object.fromEntries(RESOURCE_DISPLAY.map((resource) => [resource.id, 0]));
const bundleTotal = (bundle) => Object.values(bundle).reduce((sum, amount) => sum + amount, 0);
const hasBundle = (resources, bundle) =>
  Boolean(resources) && Object.entries(bundle ?? {}).every(([resource, amount]) => (resources[resource] ?? 0) >= amount);

export function SwapIcon({ size = 30 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8h14" />
      <path d="M14 4l4 4-4 4" />
      <path d="M20 16H6" />
      <path d="M10 12l-4 4 4 4" />
    </svg>
  );
}

function PlayerSwatch({ color }) {
  return <span className="trade-swatch" style={{ '--swatch-color': color }} aria-hidden="true" />;
}

/** One tappable resource card: tap adds one, the minus button removes one. */
function ResourceCard({ resource, count, owned = null, note = null, selected = false, disabled = false, onAdd, onRemove, testId }) {
  return (
    <div className={`trade-card${count > 0 || selected ? ' is-selected' : ''}`} data-resource={resource.id}>
      <button
        type="button"
        className="trade-card-face"
        onClick={onAdd}
        disabled={disabled}
        aria-label={`${onRemove ? 'Add' : 'Choose'} ${resource.label}${owned !== null ? ` (you have ${owned})` : ''}`}
        data-testid={testId}
      >
        <span className="trade-card-icon" aria-hidden="true">{resource.icon}</span>
        <span className="trade-card-label">{resource.label}</span>
        {owned !== null && <span className="trade-card-owned">Have {owned}</span>}
        {note && <span className="trade-card-owned">{note}</span>}
        {onRemove && count > 0 && <span className="trade-card-count" data-testid={`${testId}-count`}>{count}</span>}
      </button>
      {onRemove && (
        <button
          type="button"
          className="trade-card-minus"
          onClick={onRemove}
          disabled={count < 1}
          aria-label={`Remove one ${resource.label}`}
          data-testid={`${testId}-minus`}
        >
          −
        </button>
      )}
    </div>
  );
}

function BundleChips({ bundle }) {
  return (
    <span className="trade-chips">
      {RESOURCE_DISPLAY.filter((resource) => (bundle?.[resource.id] ?? 0) > 0).map((resource) => (
        <span className="trade-chip" key={resource.id}>
          <span aria-hidden="true">{resource.icon}</span> {bundle[resource.id]} {resource.label}
        </span>
      ))}
    </span>
  );
}

function TradeSheet({ title, onClose, children, footer, testId, labelledBy = 'trade-sheet-title' }) {
  return (
    <div className="board-sheet-backdrop" data-testid={`${testId}-backdrop`}>
      <section className="board-sheet trade-sheet" role="dialog" aria-modal="true" aria-labelledby={labelledBy} data-testid={testId}>
        <header className="board-sheet-header">
          <h2 id={labelledBy}>{title}</h2>
          {onClose && (
            <button type="button" className="sheet-close" onClick={onClose} aria-label="Close trade" data-testid="trade-close">
              ×
            </button>
          )}
        </header>
        <div className="board-sheet-body">{children}</div>
        {footer && <footer className="board-sheet-footer">{footer}</footer>}
      </section>
    </div>
  );
}

function OfferBuilder({ player, give, receive, setGive, setReceive }) {
  const adjust = (setter, resource, change, limit) =>
    setter((current) => ({ ...current, [resource]: Math.max(0, Math.min(limit, current[resource] + change)) }));

  return (
    <div className="trade-builder">
      <div className="trade-row" aria-label="You give">
        <p className="status-label">You give</p>
        <div className="trade-cards">
          {RESOURCE_DISPLAY.map((resource) => {
            const owned = player.resources[resource.id] ?? 0;
            return (
              <ResourceCard
                key={resource.id}
                resource={resource}
                count={give[resource.id]}
                owned={owned}
                disabled={give[resource.id] >= owned}
                onAdd={() => adjust(setGive, resource.id, 1, owned)}
                onRemove={() => adjust(setGive, resource.id, -1, owned)}
                testId={`trade-give-${resource.id}`}
              />
            );
          })}
        </div>
      </div>
      <div className="trade-row" aria-label="You get">
        <p className="status-label">You get</p>
        <div className="trade-cards">
          {RESOURCE_DISPLAY.map((resource) => (
            <ResourceCard
              key={resource.id}
              resource={resource}
              count={receive[resource.id]}
              disabled={receive[resource.id] >= MAX_REQUEST_PER_RESOURCE}
              onAdd={() => adjust(setReceive, resource.id, 1, MAX_REQUEST_PER_RESOURCE)}
              onRemove={() => adjust(setReceive, resource.id, -1, MAX_REQUEST_PER_RESOURCE)}
              testId={`trade-get-${resource.id}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function RecipientPicker({ opponents, recipients, setRecipients }) {
  const allSelected = opponents.length > 0 && opponents.every((item) => recipients.includes(item.id));
  const toggle = (id) =>
    setRecipients((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));

  return (
    <div className="trade-recipients" role="group" aria-label="Send offer to">
      <button
        type="button"
        className={`trade-recipient trade-recipient-all${allSelected ? ' is-selected' : ''}`}
        aria-pressed={allSelected}
        onClick={() => setRecipients(allSelected ? [] : opponents.map((item) => item.id))}
        data-testid="trade-recipient-all"
      >
        <span className="trade-check" aria-hidden="true">{allSelected ? '✓' : ''}</span>
        <strong>All players</strong>
      </button>
      {opponents.map((item) => {
        const selected = recipients.includes(item.id);
        return (
          <button
            type="button"
            key={item.id}
            className={`trade-recipient${selected ? ' is-selected' : ''}`}
            aria-pressed={selected}
            onClick={() => toggle(item.id)}
            data-testid={`trade-recipient-${item.id}`}
          >
            <span className="trade-check" aria-hidden="true">{selected ? '✓' : ''}</span>
            <PlayerSwatch color={item.color} />
            <strong>{item.name}</strong>
            <span className="trade-hand-count" data-testid={`trade-hand-count-${item.id}`}>
              {item.cardCount} {item.cardCount === 1 ? 'card' : 'cards'}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function BankTrade({ game, player, onAction, onDone }) {
  const [give, setGive] = useState(null);
  const [receive, setReceive] = useState(null);
  const ratio = give ? getPlayerPortRatio(game.board, player.id, give) : null;
  const valid = give && receive && give !== receive && (player.resources[give] ?? 0) >= ratio && game.bank[receive] > 0;

  return (
    <>
      <div className="trade-row" aria-label="Give to the bank">
        <p className="status-label">You give</p>
        <div className="trade-cards">
          {RESOURCE_DISPLAY.map((resource) => {
            const cardRatio = getPlayerPortRatio(game.board, player.id, resource.id);
            const owned = player.resources[resource.id] ?? 0;
            return (
              <ResourceCard
                key={resource.id}
                resource={resource}
                count={0}
                owned={owned}
                note={`${cardRatio}:1`}
                selected={give === resource.id}
                disabled={owned < cardRatio}
                onAdd={() => setGive(resource.id)}
                testId={`trade-bank-give-${resource.id}`}
              />
            );
          })}
        </div>
      </div>
      <div className="trade-row" aria-label="Get from the bank">
        <p className="status-label">You get</p>
        <div className="trade-cards">
          {RESOURCE_DISPLAY.map((resource) => (
            <ResourceCard
              key={resource.id}
              resource={resource}
              count={0}
              note={`Bank ${game.bank[resource.id]}`}
              selected={receive === resource.id}
              disabled={game.bank[resource.id] < 1 || resource.id === give}
              onAdd={() => setReceive(resource.id)}
              testId={`trade-bank-get-${resource.id}`}
            />
          ))}
        </div>
      </div>
      <div className="board-sheet-actions">
        <button type="button" className="secondary-button" onClick={onDone.back} data-testid="trade-back">Back</button>
        <button
          type="button"
          disabled={!valid}
          onClick={() => {
            onAction({ type: 'maritimeTrade', playerId: player.id, give, receive });
            onDone.close();
          }}
          data-testid="trade-bank-confirm"
        >
          {ratio ? `Trade ${ratio} for 1` : 'Trade with bank'}
        </button>
      </div>
    </>
  );
}

function responseLabel(response) {
  if (response === 'declined') return 'Declined';
  if (response === 'accepted') return 'Accepted';
  return 'Waiting…';
}

/** The offerer's view of an open offer: each recipient's response, plus hot-seat answers on shared devices. */
function PendingOffer({ game, offer, nameOf, colorOf, sharedDeviceMode, onAction }) {
  const from = game.players.find((item) => item.id === offer.fromPlayerId);
  return (
    <div className="pending-trade" data-testid="pending-trade">
      <p className="trade-summary">
        You give <BundleChips bundle={offer.give} /> for <BundleChips bundle={offer.receive} />
      </p>
      <ul className="trade-responses">
        {offer.toPlayerIds.map((id) => {
          const response = offer.responses?.[id];
          const recipient = game.players.find((item) => item.id === id);
          return (
            <li key={id} className="trade-response" data-testid={`trade-response-${id}`} data-response={response ?? 'waiting'}>
              <PlayerSwatch color={colorOf(id)} />
              <strong>{nameOf(id)}</strong>
              {sharedDeviceMode && response !== 'declined' ? (
                <span className="trade-response-actions">
                  <button
                    type="button"
                    disabled={!hasBundle(recipient?.resources, offer.receive) || !hasBundle(from?.resources, offer.give)}
                    onClick={() => onAction({ type: 'acceptTrade', playerId: id })}
                    data-testid={`accept-trade-${id}`}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => onAction({ type: 'rejectTrade', playerId: id })}
                    data-testid={`reject-trade-${id}`}
                  >
                    Decline
                  </button>
                </span>
              ) : (
                <span className={`trade-response-status ${response ?? 'waiting'}`}>{responseLabel(response)}</span>
              )}
            </li>
          );
        })}
      </ul>
      <div className="board-sheet-actions">
        <button
          type="button"
          className="secondary-button"
          onClick={() => onAction({ type: 'cancelTrade', playerId: offer.fromPlayerId })}
          data-testid="cancel-trade"
        >
          Cancel offer
        </button>
      </div>
    </div>
  );
}

function TradeResult({ lastTrade, nameOf, onDone }) {
  const declined = Object.entries(lastTrade.responses ?? {})
    .filter(([, response]) => response === 'declined')
    .map(([id]) => nameOf(id));
  return (
    <div className="trade-result" data-testid="trade-result" data-result={lastTrade.type}>
      {lastTrade.type === 'accepted' && (
        <>
          <p className="trade-result-title">Trade complete: {nameOf(lastTrade.toPlayerId)} accepted.</p>
          <p className="trade-summary">
            You gave <BundleChips bundle={lastTrade.give} /> and got <BundleChips bundle={lastTrade.receive} />
          </p>
        </>
      )}
      {lastTrade.type === 'rejected' && <p className="trade-result-title">No one accepted your offer.</p>}
      {lastTrade.type === 'cancelled' && <p className="trade-result-title">Offer cancelled.</p>}
      {lastTrade.type === 'expired' && <p className="trade-result-title">The offer expired.</p>}
      {declined.length > 0 && <p className="trade-help">Declined: {declined.join(', ')}</p>}
      <div className="board-sheet-actions">
        <button type="button" onClick={onDone} data-testid="trade-done">Done</button>
      </div>
    </div>
  );
}

/**
 * Swap-icon trade flow used at every screen size:
 * build the offer (give/get cards) → choose one or more recipients → send →
 * see each response. Recipients answer in their own incoming-offer dialog.
 * Opponent hands stay private: only each player's public card count is shown.
 */
function TradeControls({
  game,
  playerView = null,
  viewerId = null,
  sharedDeviceMode = true,
  isViewerTurn = false,
  onAction,
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState('build');
  const [give, setGive] = useState(emptyBundle);
  const [receive, setReceive] = useState(emptyBundle);
  const [recipients, setRecipients] = useState([]);
  const [awaitingResult, setAwaitingResult] = useState(false);

  const activeViewerId = viewerId ?? playerView?.viewerId ?? game?.currentPlayerId;
  const player = useMemo(() => {
    if (!game || !activeViewerId) return null;
    const fromView = playerView?.players.find((item) => item.id === activeViewerId && item.resources);
    return fromView ?? game.players.find((item) => item.id === activeViewerId) ?? null;
  }, [activeViewerId, game, playerView]);

  const offer = game?.tradeOffer ?? null;
  const offerIsMine = Boolean(offer && offer.fromPlayerId === activeViewerId);
  const phaseOk = game?.phase === 'action';

  useEffect(() => {
    if (!phaseOk && !offer) {
      setOpen(false);
      setAwaitingResult(false);
    }
  }, [offer, phaseOk]);

  useEffect(() => {
    if (offerIsMine) setAwaitingResult(true);
  }, [offerIsMine]);

  if (!game || !player?.resources) return null;

  const nameOf = (id) => game.players.find((item) => item.id === id)?.name ?? id;
  const colorOf = (id) => game.players.find((item) => item.id === id)?.color ?? '#43534c';
  const cardCountOf = (id) => {
    const viewPlayer = playerView?.players.find((item) => item.id === id);
    if (typeof viewPlayer?.resourceCount === 'number') return viewPlayer.resourceCount;
    return handCount(game.players.find((item) => item.id === id)?.resources);
  };
  const opponents = game.players
    .filter((item) => item.id !== player.id)
    .map((item) => ({ id: item.id, name: item.name, color: item.color, cardCount: cardCountOf(item.id) }));

  function reset() {
    setStep('build');
    setGive(emptyBundle());
    setReceive(emptyBundle());
    setRecipients([]);
  }

  function close() {
    setOpen(false);
    setAwaitingResult(false);
    reset();
  }

  const incoming = offer && !offerIsMine && offer.toPlayerIds?.includes(activeViewerId)
    && offer.responses?.[activeViewerId] !== 'declined' && !sharedDeviceMode;
  const showResult = awaitingResult && !offer && game.lastTrade
    && ['accepted', 'rejected', 'cancelled', 'expired'].includes(game.lastTrade.type);
  const canStart = isViewerTurn && phaseOk && !offer;

  let sheet = null;
  if (incoming) {
    const canAccept = hasBundle(player.resources, offer.receive);
    const others = offer.toPlayerIds.filter((id) => id !== activeViewerId);
    sheet = (
      <TradeSheet title={`${nameOf(offer.fromPlayerId)} wants to trade`} testId="incoming-trade" labelledBy="incoming-trade-title">
        <div className="trade-incoming" style={{ '--swatch-color': colorOf(offer.fromPlayerId) }}>
          <p className="status-label">You get</p>
          <BundleChips bundle={offer.give} />
          <p className="status-label">You give</p>
          <BundleChips bundle={offer.receive} />
          <p className="trade-help">
            You have {formatBundle(player.resources)}.
            {others.length > 0 && ` Also offered to ${others.map(nameOf).join(', ')}; the first to accept gets the trade.`}
          </p>
          {!canAccept && <p className="game-error" data-testid="incoming-trade-unaffordable">You don’t have the cards they asked for.</p>}
        </div>
        <div className="board-sheet-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => onAction({ type: 'rejectTrade', playerId: activeViewerId })}
            data-testid={`reject-trade-${activeViewerId}`}
          >
            Decline
          </button>
          <button
            type="button"
            disabled={!canAccept}
            onClick={() => onAction({ type: 'acceptTrade', playerId: activeViewerId })}
            data-testid={`accept-trade-${activeViewerId}`}
          >
            Accept
          </button>
        </div>
      </TradeSheet>
    );
  } else if (offerIsMine) {
    sheet = (
      <TradeSheet title="Offer sent" testId="trade-flow">
        <PendingOffer game={game} offer={offer} nameOf={nameOf} colorOf={colorOf} sharedDeviceMode={sharedDeviceMode} onAction={onAction} />
      </TradeSheet>
    );
  } else if (showResult) {
    sheet = (
      <TradeSheet title="Trade result" testId="trade-flow" onClose={close}>
        <TradeResult lastTrade={game.lastTrade} nameOf={nameOf} onDone={close} />
      </TradeSheet>
    );
  } else if (open && canStart) {
    if (step === 'bank') {
      sheet = (
        <TradeSheet title="Trade with the bank" testId="trade-flow" onClose={close}>
          <BankTrade game={game} player={player} onAction={onAction} onDone={{ back: () => setStep('build'), close }} />
        </TradeSheet>
      );
    } else if (step === 'recipients') {
      sheet = (
        <TradeSheet
          title="Send offer to"
          testId="trade-flow"
          onClose={close}
          footer={(
            <>
              <button type="button" className="secondary-button" onClick={() => setStep('build')} data-testid="trade-back">Back</button>
              <button
                type="button"
                disabled={recipients.length === 0}
                onClick={() => onAction({ type: 'offerTrade', playerId: player.id, toPlayerIds: recipients, give, receive })}
                data-testid="offer-trade"
              >
                Send offer{recipients.length > 1 ? ` to ${recipients.length}` : ''}
              </button>
            </>
          )}
        >
          <p className="trade-summary">
            You give <BundleChips bundle={give} /> for <BundleChips bundle={receive} />
          </p>
          <RecipientPicker opponents={opponents} recipients={recipients} setRecipients={setRecipients} />
        </TradeSheet>
      );
    } else {
      const ready = bundleTotal(give) > 0 && bundleTotal(receive) > 0 && hasBundle(player.resources, give);
      sheet = (
        <TradeSheet
          title="Build your offer"
          testId="trade-flow"
          onClose={close}
          footer={(
            <>
              <button type="button" className="secondary-button" onClick={() => setStep('bank')} data-testid="trade-bank">
                Bank / port
              </button>
              <button type="button" disabled={!ready} onClick={() => setStep('recipients')} data-testid="trade-next">
                Choose players
              </button>
            </>
          )}
        >
          <OfferBuilder player={player} give={give} receive={receive} setGive={setGive} setReceive={setReceive} />
        </TradeSheet>
      );
    }
  }

  return (
    <>
      {canStart && (
        <button
          type="button"
          className="hud-icon-button hud-labeled trade-icon-button"
          onClick={() => { reset(); setOpen(true); }}
          aria-label="Trade resources"
          title="Trade resources"
          data-testid="toggle-trades"
        >
          <SwapIcon size={24} />
          <span className="hud-caption" aria-hidden="true">Trade</span>
        </button>
      )}
      {sheet}
    </>
  );
}

export default TradeControls;
