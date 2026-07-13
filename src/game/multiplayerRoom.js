const PARTICIPANT_ID_KEY = 'catanParticipantId';

export const ROOM_STATUS = {
  LOBBY: 'lobby',
  ACTIVE: 'active',
  HOST_DISCONNECTED: 'host-disconnected',
};

export const PLAYER_ROLES = {
  HOST: 'host',
  PLAYER: 'player',
  SPECTATOR: 'spectator',
};

export const MULTIPLAYER_MESSAGE_TYPES = {
  HELLO: 'lobby:hello',
  LOBBY_STATE: 'lobby:state',
  CLAIM_SEAT: 'seat:claim',
  RELEASE_SEAT: 'seat:release',
  GAME_START: 'game:start',
  GAME_SNAPSHOT: 'game:snapshot',
  ACTION_REQUEST: 'game:actionRequest',
  ACTION_REJECTED: 'game:actionRejected',
  HOST_HEARTBEAT: 'host:heartbeat',
  ROOM_ERROR: 'room:error',
};

export function getOrCreateParticipantId(storage = globalThis.localStorage) {
  const existing = storage?.getItem?.(PARTICIPANT_ID_KEY);
  if (existing) return existing;

  const created =
    globalThis.crypto?.randomUUID?.() ??
    `participant-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
  storage?.setItem?.(PARTICIPANT_ID_KEY, created);
  return created;
}

export function createLobbyState({ roomName, hostParticipantId, players, playerCount }) {
  const activePlayers = players.slice(0, playerCount);
  return {
    room: {
      roomName,
      hostParticipantId,
      status: ROOM_STATUS.LOBBY,
      playerCount,
    },
    seats: activePlayers.map((player) => ({
      playerId: player.id,
      label: player.label,
      color: player.color,
      claimedBy: null,
      displayName: '',
      connected: false,
    })),
    spectators: [],
    version: 0,
  };
}

export function setLobbyPlayerCount(lobbyState, players, playerCount) {
  if (lobbyState.room.status !== ROOM_STATUS.LOBBY) return lobbyState;

  const activePlayerIds = new Set(players.slice(0, playerCount).map((player) => player.id));
  const existingSeats = new Map(lobbyState.seats.map((seat) => [seat.playerId, seat]));
  return {
    ...lobbyState,
    room: { ...lobbyState.room, playerCount },
    seats: players.slice(0, playerCount).map((player) => ({
      playerId: player.id,
      label: player.label,
      color: player.color,
      claimedBy: null,
      displayName: '',
      connected: false,
      ...existingSeats.get(player.id),
    })).filter((seat) => activePlayerIds.has(seat.playerId)),
    version: lobbyState.version + 1,
  };
}

export function claimSeat(lobbyState, { playerId, participantId, displayName }) {
  if (lobbyState.room.status !== ROOM_STATUS.LOBBY) {
    return addSpectator(lobbyState, { participantId, displayName });
  }

  const target = lobbyState.seats.find((seat) => seat.playerId === playerId);
  if (!target) return addSpectator(lobbyState, { participantId, displayName });
  if (target.claimedBy && target.claimedBy !== participantId && target.connected) return lobbyState;

  return {
    ...lobbyState,
    seats: lobbyState.seats.map((seat) => {
      if (seat.claimedBy === participantId && seat.playerId !== playerId) {
        return { ...seat, claimedBy: null, displayName: '', connected: false };
      }
      if (seat.playerId !== playerId) return seat;
      return {
        ...seat,
        claimedBy: participantId,
        displayName,
        connected: true,
      };
    }),
    spectators: lobbyState.spectators.filter((spectator) => spectator.participantId !== participantId),
    version: lobbyState.version + 1,
  };
}

export function releaseSeat(lobbyState, participantId) {
  return {
    ...lobbyState,
    seats: lobbyState.seats.map((seat) =>
      seat.claimedBy === participantId
        ? { ...seat, claimedBy: null, displayName: '', connected: false }
        : seat,
    ),
    version: lobbyState.version + 1,
  };
}

export function markParticipantConnected(lobbyState, { participantId, displayName }) {
  const seat = lobbyState.seats.find((item) => item.claimedBy === participantId);
  if (seat) {
    return {
      ...lobbyState,
      seats: lobbyState.seats.map((item) =>
        item.claimedBy === participantId
          ? { ...item, connected: true, displayName: displayName || item.displayName }
          : item,
      ),
      version: lobbyState.version + 1,
    };
  }

  return addSpectator(lobbyState, { participantId, displayName });
}

export function markParticipantDisconnected(lobbyState, participantId) {
  const hostDisconnected = participantId === lobbyState.room.hostParticipantId;
  return {
    ...lobbyState,
    room: hostDisconnected
      ? { ...lobbyState.room, status: ROOM_STATUS.HOST_DISCONNECTED }
      : lobbyState.room,
    seats: lobbyState.seats.map((seat) =>
      seat.claimedBy === participantId ? { ...seat, connected: false } : seat,
    ),
    spectators: lobbyState.spectators.map((spectator) =>
      spectator.participantId === participantId ? { ...spectator, connected: false } : spectator,
    ),
    version: lobbyState.version + 1,
  };
}

export function startLobbyGame(lobbyState) {
  return {
    ...lobbyState,
    room: { ...lobbyState.room, status: ROOM_STATUS.ACTIVE },
    version: lobbyState.version + 1,
  };
}

export function getParticipantRole(lobbyState, participantId) {
  if (!participantId) return PLAYER_ROLES.SPECTATOR;
  if (lobbyState?.room.hostParticipantId === participantId) return PLAYER_ROLES.HOST;
  if (getParticipantPlayerId(lobbyState, participantId)) return PLAYER_ROLES.PLAYER;
  return PLAYER_ROLES.SPECTATOR;
}

export function getParticipantPlayerId(lobbyState, participantId) {
  return lobbyState?.seats.find((seat) => seat.claimedBy === participantId)?.playerId ?? null;
}

export function areRequiredSeatsClaimed(lobbyState) {
  return Boolean(lobbyState?.seats.length) && lobbyState.seats.every((seat) => seat.claimedBy && seat.connected);
}

export function canParticipantAct({ lobbyState, participantId, game }) {
  if (!game || lobbyState?.room.status !== ROOM_STATUS.ACTIVE) return false;
  return getParticipantPlayerId(lobbyState, participantId) === game.currentPlayerId;
}

export function canHostStart(lobbyState, participantId) {
  return (
    lobbyState?.room.status === ROOM_STATUS.LOBBY &&
    lobbyState.room.hostParticipantId === participantId &&
    areRequiredSeatsClaimed(lobbyState)
  );
}

function addSpectator(lobbyState, { participantId, displayName }) {
  if (!participantId) return lobbyState;
  const existing = lobbyState.spectators.some((spectator) => spectator.participantId === participantId);
  return {
    ...lobbyState,
    spectators: existing
      ? lobbyState.spectators.map((spectator) =>
          spectator.participantId === participantId
            ? { ...spectator, displayName, connected: true }
            : spectator,
        )
      : [...lobbyState.spectators, { participantId, displayName, connected: true }],
    version: lobbyState.version + 1,
  };
}
