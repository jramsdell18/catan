import { describe, expect, it } from 'vitest';
import { createToastsFromLog, describeGameEvent, MAX_TOASTS } from '../../src/game/toasts.js';

const players = [
  { id: 'red', name: 'Red', color: '#c84335' },
  { id: 'blue', name: 'Blue (bot)', color: '#2f68b8' },
  { id: 'orange', name: 'Orange', color: '#d98324' },
];

describe('game event toasts', () => {
  it('names the acting player and describes builds, rolls, robber, cards and trades', () => {
    const game = {
      players,
      dice: [3, 5],
      lastRobbery: { victimId: 'orange' },
      lastDevelopment: { card: 'knight' },
      lastTrade: { type: 'accepted', fromPlayerId: 'blue', toPlayerId: 'orange', toPlayerIds: ['orange'] },
    };
    const latest = (type, playerId) => describeGameEvent({ type, playerId }, game, { isLatest: true }).message;
    expect(latest('buildCity', 'orange')).toBe('Orange placed a city');
    expect(latest('placeRoad', 'red')).toBe('Red placed a road');
    expect(latest('rollDice', 'blue')).toBe('Blue (bot) rolled 8');
    expect(latest('moveRobber', 'red')).toBe('Red moved the robber and robbed Orange');
    expect(latest('playDevelopment', 'red')).toBe('Red played a Knight');
    expect(describeGameEvent({ type: 'acceptTrade', playerId: 'orange' }, game, { isLatest: true }))
      .toEqual({ playerId: 'blue', message: 'Blue (bot) traded with Orange' });
    // Older entries fall back to generic text because last* fields describe only the newest action.
    expect(describeGameEvent({ type: 'rollDice', playerId: 'blue' }, game).message).toBe('Blue (bot) rolled the dice');
    expect(describeGameEvent({ type: 'endTurn', playerId: 'blue' }, game)).toBeNull();
  });

  it('creates coloured toasts only for new log entries and skips large history syncs', () => {
    const log = [
      { type: 'placeSettlement', playerId: 'red' },
      { type: 'placeRoad', playerId: 'red' },
    ];
    const toasts = createToastsFromLog({ players, log }, 0);
    expect(toasts.map((toast) => toast.message)).toEqual(['Red placed a settlement', 'Red placed a road']);
    expect(toasts[0].color).toBe('#c84335');
    expect(createToastsFromLog({ players, log }, 2)).toEqual([]);
    const history = Array.from({ length: MAX_TOASTS * 2 + 1 }, () => ({ type: 'placeRoad', playerId: 'blue' }));
    expect(createToastsFromLog({ players, log: history }, 0)).toEqual([]);
  });
});
