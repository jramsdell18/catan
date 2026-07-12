export const RESOURCE_TYPES = Object.freeze(['wood', 'brick', 'ore', 'hay', 'sheep']);

export const TERRAIN_RESOURCE = Object.freeze({
  hills: 'brick',
  forest: 'wood',
  mountains: 'ore',
  fields: 'hay',
  pasture: 'sheep',
  desert: null,
});

export const BUILDING_COSTS = Object.freeze({
  road: Object.freeze({ brick: 1, wood: 1 }),
  settlement: Object.freeze({ brick: 1, wood: 1, hay: 1, sheep: 1 }),
  city: Object.freeze({ ore: 3, hay: 2 }),
  development: Object.freeze({ ore: 1, hay: 1, sheep: 1 }),
});

export const PIECE_LIMITS = Object.freeze({ roads: 15, settlements: 5, cities: 4 });
export const VICTORY_POINTS_TO_WIN = 10;
export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 4;

export const DEVELOPMENT_DECK = Object.freeze([
  ...Array(14).fill('knight'),
  ...Array(5).fill('victoryPoint'),
  ...Array(2).fill('roadBuilding'),
  ...Array(2).fill('yearOfPlenty'),
  ...Array(2).fill('monopoly'),
]);

export const emptyResources = () => Object.fromEntries(RESOURCE_TYPES.map((resource) => [resource, 0]));
