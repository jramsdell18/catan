import { useMemo } from 'react';
import { getPlayerView } from '../rules/index.js';

/**
 * Seat-scoped UI snapshot. Engine state stays full for applyAction / legal targets;
 * rendering of hands and private outcomes should prefer this view.
 *
 * @param {object | null} game authoritative engine state
 * @param {string | null} viewerId player id whose private info is visible
 */
export function usePlayerView(game, viewerId) {
  return useMemo(() => {
    if (!game || !viewerId) return null;
    if (!game.players.some((player) => player.id === viewerId)) return null;
    return getPlayerView(game, viewerId);
  }, [game, viewerId]);
}
