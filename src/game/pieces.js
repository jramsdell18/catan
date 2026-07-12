export const PLAYER_COLORS = [
  { id: 'red', label: 'Red', color: '#c84335' },
  { id: 'blue', label: 'Blue', color: '#2f68b8' },
  { id: 'white', label: 'White', color: '#f4f1e8' },
  { id: 'orange', label: 'Orange', color: '#d98324' },
  { id: 'green', label: 'Green', color: '#2d8b57' },
  { id: 'purple', label: 'Purple', color: '#7b56a3' },
];

export const PLAYER_PIECE_TYPES = {
  road: {
    id: 'road',
    label: 'Road',
    maxPerPlayer: 15,
    placement: 'path',
    colorAttribute: 'player.color',
  },
  settlement: {
    id: 'settlement',
    label: 'Settlement',
    maxPerPlayer: 5,
    placement: 'intersection',
    victoryPoints: 1,
    colorAttribute: 'player.color',
  },
  city: {
    id: 'city',
    label: 'City',
    maxPerPlayer: 4,
    placement: 'intersection',
    victoryPoints: 2,
    colorAttribute: 'player.color',
  },
};

export const NEUTRAL_PIECE_TYPES = {
  robber: {
    id: 'robber',
    label: 'Robber',
    startsOnTerrain: 'desert',
    blocksProduction: true,
  },
};

export function getActivePlayers(playerCount) {
  return PLAYER_COLORS.slice(0, playerCount).map((player, index) => ({
    ...player,
    seat: index + 1,
  }));
}
