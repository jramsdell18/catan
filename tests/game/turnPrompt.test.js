import { describe, expect, it } from 'vitest';
import { getTurnPrompt } from '../../src/game/turnPrompt.js';

describe('turn prompt', () => {
  const base = { currentPlayerName: 'Red', isViewerTurn: true };
  it('gives one clear next step per phase', () => {
    expect(getTurnPrompt({ ...base, game: { phase: 'setup', setupSettlementId: null } })).toBe('Place your settlement: tap a glowing spot');
    expect(getTurnPrompt({ ...base, game: { phase: 'setup', setupSettlementId: 'v1' } })).toBe('Place a road next to your new settlement');
    expect(getTurnPrompt({ ...base, game: { phase: 'roll' } })).toBe('Roll the dice');
    expect(getTurnPrompt({ ...base, game: { phase: 'action' } })).toBe('Build, trade, or end your turn');
    expect(getTurnPrompt({ ...base, game: { phase: 'robber' } })).toBe('Move the robber: tap a hex');
    expect(getTurnPrompt({ ...base, game: { phase: 'robber' }, robberTileSelected: true })).toBe('Choose a player to rob');
  });

  it('describes build modes, waiting, discards, and shared devices', () => {
    expect(getTurnPrompt({ ...base, game: { phase: 'action' }, requestedMode: 'placeRoad' })).toBe('Tap a glowing edge to build your road');
    expect(getTurnPrompt({ ...base, isViewerTurn: false, currentPlayerName: 'Blue (bot)', game: { phase: 'roll' } })).toBe('Waiting for Blue (bot)…');
    expect(getTurnPrompt({ ...base, isViewerTurn: false, viewerMustDiscard: true, game: { phase: 'discard' } })).toBe('Too many cards: discard half your hand');
    expect(getTurnPrompt({ ...base, sharedDevice: true, game: { phase: 'roll' } })).toBe('Red: roll the dice');
    expect(getTurnPrompt({ ...base, game: null })).toBe('');
  });
});
