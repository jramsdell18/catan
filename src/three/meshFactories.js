import * as THREE from 'three';
import { TERRAIN_TYPES } from '../game/terrain.js';

const HEX_HEIGHT = 0.22;
const HEX_ROTATION = Math.PI / 6;
const HEX_OUTLINE_CORNER_START = Math.PI / 6;
const HEX_TILE_CORNER_START = HEX_OUTLINE_CORNER_START + HEX_ROTATION;

function makeMaterial(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.72,
    metalness: 0.04,
    ...options,
  });
}

function addTileTrim(group, radius) {
  const points = Array.from({ length: 6 }, (_, index) => {
    const angle = HEX_OUTLINE_CORNER_START + (index * Math.PI) / 3;
    return new THREE.Vector3(Math.cos(angle) * radius, HEX_HEIGHT / 2 + 0.025, Math.sin(angle) * radius);
  });
  const trimGeometry = new THREE.BufferGeometry().setFromPoints(points);
  const trim = new THREE.LineLoop(trimGeometry, new THREE.LineBasicMaterial({ color: '#efe8d6' }));
  group.add(trim);
}

export function createHexTileMesh(hex, radius = 1) {
  const terrain = TERRAIN_TYPES[hex.terrainId];
  const group = new THREE.Group();
  group.name = `${hex.hexId}-${terrain.id}`;

  const geometry = new THREE.CylinderGeometry(radius, radius, HEX_HEIGHT, 6, 1, false, HEX_TILE_CORNER_START);
  const mesh = new THREE.Mesh(geometry, makeMaterial(terrain.color));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  addTileTrim(group, radius);

  return group;
}

export function createRoadMesh(color) {
  const group = new THREE.Group();
  const road = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.12, 0.2), makeMaterial(color));
  road.scale.setScalar(0.6);
  road.position.y = 0.036;
  road.castShadow = true;
  group.add(road);
  return group;
}

export function createSettlementMesh(color) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.28, 0.34), makeMaterial(color));
  body.position.y = 0.14;
  body.castShadow = true;

  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.22, 4), makeMaterial('#3c2a1e'));
  roof.position.y = 0.39;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;

  group.add(body, roof);
  group.scale.setScalar(0.75);
  return group;
}

export function createSettlementHighlightMesh(color = '#f7dc6f') {
  const material = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.45,
    transparent: true,
    opacity: 0.72,
    roughness: 0.4,
  });
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 24), material);
  mesh.castShadow = true;

  return mesh;
}

export function createRoadHighlightMesh(length, color = '#f7dc6f') {
  const material = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.45,
    transparent: true,
    opacity: 0.72,
    roughness: 0.4,
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, length * 0.86), material);
  mesh.castShadow = true;

  return mesh;
}

export function createCityMesh(color) {
  const group = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.34, 0.38), makeMaterial(color));
  base.position.set(-0.08, 0.17, 0);
  base.castShadow = true;

  const tower = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.54, 0.28), makeMaterial(color));
  tower.position.set(0.25, 0.27, 0);
  tower.castShadow = true;

  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.2, 4), makeMaterial('#3c2a1e'));
  roof.position.set(0.25, 0.64, 0);
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;

  group.add(base, tower, roof);
  group.scale.setScalar(0.75);
  return group;
}

export function createCardZoneMesh() {
  const group = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(1.85, 0.04, 0.92),
    new THREE.MeshStandardMaterial({ color: '#1f6671', roughness: 0.78 }),
  );
  base.position.y = 0.02;
  base.receiveShadow = true;
  group.add(base);

  return group;
}

export function createResourceCardMesh() {
  const group = new THREE.Group();
  const cardThickness = 0.006;
  const cardCenterY = cardThickness / 2;
  const border = new THREE.Mesh(
    new THREE.BoxGeometry(0.39, cardThickness, 0.57),
    new THREE.MeshStandardMaterial({ color: '#edf3ff', roughness: 0.5 }),
  );
  border.position.y = cardCenterY;
  border.castShadow = true;
  group.add(border);

  const card = new THREE.Mesh(
    new THREE.BoxGeometry(0.35, cardThickness, 0.53),
    new THREE.MeshStandardMaterial({ color: '#173f86', roughness: 0.62 }),
  );
  card.position.y = cardCenterY;
  card.castShadow = true;
  card.receiveShadow = true;
  group.add(card);

  const inset = new THREE.Mesh(
    new THREE.BoxGeometry(0.25, cardThickness, 0.4),
    new THREE.MeshStandardMaterial({ color: '#2c63ba', roughness: 0.68 }),
  );
  inset.position.y = cardCenterY;
  group.add(inset);

  return group;
}

export function createRobberMesh() {
  const material = makeMaterial('#242424', { roughness: 0.55 });
  const group = new THREE.Group();

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.12, 18), material);
  base.position.y = 0.1;

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.18, 0.46, 18), material);
  body.position.y = 0.38;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 18, 14), material);
  head.position.y = 0.68;

  const hood = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.18, 18), material);
  hood.position.y = 0.84;

  group.add(base, body, head, hood);
  group.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
    }
  });

  return group;
}
