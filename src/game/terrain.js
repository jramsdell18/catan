export const TERRAIN_TYPES = {
  forest: {
    id: 'forest',
    label: 'Forest',
    resource: 'wood',
    count: 4,
    color: '#167a3e',
    textColor: '#f7fbf2',
  },
  fields: {
    id: 'fields',
    label: 'Fields',
    resource: 'hay',
    count: 4,
    color: '#f0c928',
    textColor: '#211a08',
  },
  hills: {
    id: 'hills',
    label: 'Hills',
    resource: 'brick',
    count: 3,
    color: '#d64b2f',
    textColor: '#fff7ef',
  },
  mountains: {
    id: 'mountains',
    label: 'Mountains',
    resource: 'ore',
    count: 3,
    color: '#5867a3',
    textColor: '#ffffff',
  },
  pasture: {
    id: 'pasture',
    label: 'Pasture',
    resource: 'sheep',
    count: 4,
    color: '#8ed34f',
    textColor: '#16220d',
  },
  desert: {
    id: 'desert',
    label: 'Desert',
    resource: null,
    count: 1,
    color: '#d7a45f',
    textColor: '#24160b',
  },
};

export const TERRAIN_TYPE_ORDER = ['forest', 'fields', 'hills', 'mountains', 'pasture', 'desert'];

export function createTerrainDeck() {
  return TERRAIN_TYPE_ORDER.flatMap((terrainId) =>
    Array.from({ length: TERRAIN_TYPES[terrainId].count }, (_, index) => ({
      id: `${terrainId}-${index + 1}`,
      terrainId,
    })),
  );
}

export function summarizeTerrain(hexes) {
  return TERRAIN_TYPE_ORDER.map((terrainId) => {
    const terrain = TERRAIN_TYPES[terrainId];
    const placed = hexes.filter((hex) => hex.terrainId === terrainId).length;

    return {
      terrainId,
      label: terrain.label,
      resource: terrain.resource,
      expected: terrain.count,
      placed,
    };
  });
}
