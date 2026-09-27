import { useState } from 'react';
import { getSeatAvailability, SEAT_STATUS } from '../../game/multiplayerRoom.js';
import { LinkIcon } from './HudIcons.jsx';

const PLAYER_COUNT_OPTIONS = [3, 4];

export const LOBBY_MODES = {
  LOCAL_TEST: 'local-test',
  SOLO: 'solo',
  HOST: 'host',
  GUEST: 'guest',
  WAITING: 'waiting-host',
  FULL: 'full',
};

function PlayerCountPicker({ value, onChange, disabled = false, label = 'Players' }) {
  return (
    <div className="lobby-field">
      <span className="lobby-label" id="player-count-label">{label}</span>
      <div className="segmented" role="group" aria-labelledby="player-count-label" data-testid="player-count">
        {PLAYER_COUNT_OPTIONS.map((count) => (
          <button
            key={count}
            type="button"
            aria-pressed={value === count}
            disabled={disabled}
            onClick={() => onChange(count)}
            data-testid={`player-count-${count}`}
          >
            {count} players
          </button>
        ))}
      </div>
    </div>
  );
}

function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.top = '-1000px';
  document.body.append(area);
  area.select();
  document.execCommand('copy');
  area.remove();
  return Promise.resolve();
}

function InviteLink({ url }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    try {
      await copyText(url);
    } catch {
      // Clipboard can be blocked; the link stays visible and selectable.
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2200);
  }
  return (
    <div className="invite-box">
      <input
        className="invite-url"
        readOnly
        value={url}
        aria-label="Invite link"
        onFocus={(event) => event.target.select()}
        data-testid="invite-url"
      />
      <button type="button" className="lobby-primary-lite" onClick={handleCopy} data-testid="copy-invite-link">
        <LinkIcon size={18} /> {copied ? 'Copied!' : 'Copy invite link'}
      </button>
    </div>
  );
}

/** Color grid: open colors are buttons; taken colors are shown but unavailable. */
function ColorGrid({ lobbyState, participantId, pendingPlayerId, onPick }) {
  const seats = getSeatAvailability(lobbyState, participantId);
  return (
    <div className="color-grid" role="group" aria-label="Colors" data-testid="color-picker">
      {seats.map((seat) => {
        const pending = pendingPlayerId === seat.playerId;
        const taken = seat.status === SEAT_STATUS.TAKEN;
        const mine = seat.status === SEAT_STATUS.MINE;
        const caption = mine ? 'You' : taken ? (seat.displayName || 'Taken') : pending ? 'Joining…' : 'Open';
        return (
          <button
            key={seat.playerId}
            type="button"
            className={`color-option${mine ? ' is-mine' : ''}${taken ? ' is-taken' : ''}`}
            style={{ '--seat-color': seat.color }}
            disabled={taken || mine || Boolean(pendingPlayerId)}
            aria-pressed={mine}
            aria-label={`${seat.label}: ${mine ? 'your color' : taken ? `taken by ${seat.displayName || 'another player'}` : 'available'}`}
            onClick={() => onPick(seat.playerId)}
            data-testid={`pick-color-${seat.playerId}`}
            data-status={seat.status}
          >
            <span className="color-swatch" aria-hidden="true" />
            <strong>{seat.label}</strong>
            <small>{caption}</small>
          </button>
        );
      })}
    </div>
  );
}

function StartGameOverlay({
  mode,
  playerCount,
  onSelectPlayerCount,
  onStart,
  canStartGame = false,
  lobbyState = null,
  participantId = null,
  pendingClaim = null,
  claimNotice = '',
  onClaimSeat,
  inviteUrl = '',
  onExitSolo,
  onRetryJoin,
  newGameUrl = '/',
}) {
  if (!mode) return null;

  if (mode === LOBBY_MODES.FULL) {
    return (
      <div className="start-overlay lobby-card" role="alertdialog" aria-labelledby="lobby-full-title" data-testid="lobby-full">
        <p className="eyebrow">Can’t join</p>
        <h1 id="lobby-full-title">Lobby is full</h1>
        <p className="helper-text">Every color in this game is taken, so you weren’t added. Ask the host to make room, or start your own game.</p>
        <div className="lobby-actions">
          <button type="button" className="lobby-primary" onClick={onRetryJoin} data-testid="lobby-full-retry">Try again</button>
          <a className="lobby-secondary" href={newGameUrl} data-testid="lobby-full-new">Start a new game</a>
        </div>
      </div>
    );
  }

  if (mode === LOBBY_MODES.WAITING) {
    return (
      <div className="start-overlay lobby-card" aria-labelledby="start-title" data-testid="lobby-waiting">
        <p className="eyebrow">You’re invited</p>
        <h1 id="start-title">Connecting…</h1>
        <p className="helper-text" role="status">Waiting for the host’s lobby. Keep this page open.</p>
      </div>
    );
  }

  if (mode === LOBBY_MODES.SOLO || mode === LOBBY_MODES.LOCAL_TEST) {
    const solo = mode === LOBBY_MODES.SOLO;
    return (
      <div className="start-overlay lobby-card" aria-labelledby="start-title" data-testid={solo ? 'solo-bot-mode' : 'local-test-mode'}>
        <p className="eyebrow">{solo ? 'Solo game' : 'Developer'}</p>
        <h1 id="start-title">{solo ? 'Play against bots' : 'Local test game'}</h1>
        <p className="helper-text" data-testid="player-setup-helper">
          {solo
            ? `You play Red with ${playerCount - 1} bots.`
            : `All ${playerCount} seats play on this device.`}
        </p>
        <PlayerCountPicker value={playerCount} onChange={onSelectPlayerCount} label={solo ? 'Players (you + bots)' : 'Players'} />
        <button type="button" className="lobby-primary" data-testid="start-game" onClick={onStart} disabled={!canStartGame}>
          Start game
        </button>
        {solo && (
          <button type="button" className="lobby-link" onClick={onExitSolo} data-testid="exit-solo-bots">
            Play with friends instead
          </button>
        )}
      </div>
    );
  }

  const seats = getSeatAvailability(lobbyState, participantId);
  const mySeat = seats.find((seat) => seat.status === SEAT_STATUS.MINE) ?? null;
  const readyCount = seats.filter((seat) => seat.claimedBy && seat.connected).length;
  const waitingFor = seats.length - readyCount;

  if (mode === LOBBY_MODES.HOST) {
    return (
      <div className="start-overlay lobby-card" aria-labelledby="start-title" data-testid="host-lobby">
        <p className="eyebrow">Your lobby</p>
        <h1 id="start-title">Invite friends</h1>
        <p className="helper-text">Send this link. Friends open it, pick a color, and appear below.</p>
        <InviteLink url={inviteUrl} />
        <PlayerCountPicker value={playerCount} onChange={onSelectPlayerCount} />
        <div className="lobby-field">
          <span className="lobby-label">Colors {mySeat ? '(tap an open color to switch)' : ''}</span>
          <ColorGrid lobbyState={lobbyState} participantId={participantId} onPick={onClaimSeat} />
        </div>
        <p className="helper-text" data-testid="player-setup-helper">
          {waitingFor > 0 ? `Waiting for ${waitingFor} more ${waitingFor === 1 ? 'player' : 'players'}.` : 'Everyone is here!'}
        </p>
        <button type="button" className="lobby-primary" data-testid="start-game" onClick={onStart} disabled={!canStartGame}>
          Start game
        </button>
      </div>
    );
  }

  // Guest: pick a color first; you only join the game once the host confirms it.
  return (
    <div className="start-overlay lobby-card" aria-labelledby="start-title" data-testid="guest-lobby">
      <p className="eyebrow">{mySeat ? 'You’re in' : 'You’re invited'}</p>
      <h1 id="start-title">{mySeat ? `You’re ${mySeat.label}` : 'Pick your color'}</h1>
      {claimNotice && <p className="lobby-notice" role="alert" data-testid="claim-notice">{claimNotice}</p>}
      <ColorGrid
        lobbyState={lobbyState}
        participantId={participantId}
        pendingPlayerId={pendingClaim?.playerId ?? null}
        onPick={onClaimSeat}
      />
      <p className="helper-text" data-testid="player-setup-helper">
        {mySeat
          ? `Waiting for the host to start (${readyCount}/${seats.length} players).`
          : 'Taken colors are greyed out.'}
      </p>
    </div>
  );
}

export default StartGameOverlay;
