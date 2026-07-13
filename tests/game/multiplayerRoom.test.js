import { describe, expect, it } from 'vitest';
import {
  canParticipantAct,
  claimSeat,
  createLobbyState,
  getParticipantPlayerId,
  getParticipantRole,
  markParticipantDisconnected,
  PLAYER_ROLES,
  ROOM_STATUS,
  startLobbyGame,
} from '../../src/game/multiplayerRoom.js';
import { getActivePlayers } from '../../src/game/pieces.js';

function lobby() {
  return createLobbyState({
    roomName: 'catan-table-test',
    hostParticipantId: 'host-1',
    players: getActivePlayers(4),
    playerCount: 3,
  });
}

describe('multiplayer room lobby helpers', () => {
  it('claims seats and rejects duplicate connected claims', () => {
    const claimed = claimSeat(lobby(), {
      playerId: 'red',
      participantId: 'host-1',
      displayName: 'Host',
    });
    const duplicate = claimSeat(claimed, {
      playerId: 'red',
      participantId: 'guest-1',
      displayName: 'Guest',
    });

    expect(getParticipantPlayerId(duplicate, 'host-1')).toBe('red');
    expect(getParticipantPlayerId(duplicate, 'guest-1')).toBeNull();
  });

  it('treats late joiners after game start as spectators', () => {
    const active = startLobbyGame(lobby());
    const joined = claimSeat(active, {
      playerId: 'blue',
      participantId: 'guest-1',
      displayName: 'Guest',
    });

    expect(joined.room.status).toBe(ROOM_STATUS.ACTIVE);
    expect(getParticipantPlayerId(joined, 'guest-1')).toBeNull();
    expect(getParticipantRole(joined, 'guest-1')).toBe(PLAYER_ROLES.SPECTATOR);
    expect(joined.spectators).toContainEqual({
      participantId: 'guest-1',
      displayName: 'Guest',
      connected: true,
    });
  });

  it('only allows the claimed current player to act', () => {
    const state = claimSeat(lobby(), {
      playerId: 'red',
      participantId: 'host-1',
      displayName: 'Host',
    });
    const active = startLobbyGame(state);
    const game = { currentPlayerId: 'red' };

    expect(canParticipantAct({ lobbyState: active, participantId: 'host-1', game })).toBe(true);
    expect(canParticipantAct({ lobbyState: active, participantId: 'guest-1', game })).toBe(false);
  });

  it('marks the room read-only when the host disconnects', () => {
    const state = claimSeat(lobby(), {
      playerId: 'red',
      participantId: 'host-1',
      displayName: 'Host',
    });

    const disconnected = markParticipantDisconnected(startLobbyGame(state), 'host-1');

    expect(disconnected.room.status).toBe(ROOM_STATUS.HOST_DISCONNECTED);
    expect(disconnected.seats.find((seat) => seat.playerId === 'red').connected).toBe(false);
  });
});
