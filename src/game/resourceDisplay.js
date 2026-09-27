/** Display order, labels, and icons for the five resources (engine key `hay` is shown as Wheat). */
export const RESOURCE_DISPLAY = Object.freeze([
  { id: 'wood', label: 'Wood', icon: '🌲' },
  { id: 'brick', label: 'Brick', icon: '🧱' },
  { id: 'sheep', label: 'Sheep', icon: '🐑' },
  { id: 'hay', label: 'Wheat', icon: '🌾' },
  { id: 'ore', label: 'Ore', icon: '⛰️' },
]);

export const RESOURCE_LABELS = Object.freeze(
  Object.fromEntries(RESOURCE_DISPLAY.map((resource) => [resource.id, resource.label])),
);

export function formatBundle(bundle) {
  const parts = RESOURCE_DISPLAY
    .filter((resource) => (bundle?.[resource.id] ?? 0) > 0)
    .map((resource) => `${bundle[resource.id]} ${resource.label.toLowerCase()}`);
  return parts.length ? parts.join(', ') : 'nothing';
}

export function handCount(resources) {
  return Object.values(resources ?? {}).reduce((sum, amount) => sum + amount, 0);
}
