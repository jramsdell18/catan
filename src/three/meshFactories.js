import * as THREE from 'three';
import { TERRAIN_TYPES } from '../game/terrain.js';

const HEX_HEIGHT = 0.22;
const HEX_ROTATION = Math.PI / 6;
const HEX_OUTLINE_CORNER_START = Math.PI / 6;
const HEX_TILE_CORNER_START = HEX_OUTLINE_CORNER_START + HEX_ROTATION;
const NUMBER_TOKEN_PIPS = {
  2: 1,
  3: 2,
  4: 3,
  5: 4,
  6: 5,
  8: 5,
  9: 4,
  10: 3,
  11: 2,
  12: 1,
};

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

function createNumberTokenTexture(number) {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 160;

  const context = canvas.getContext('2d');
  const isRedNumber = number === 6 || number === 8;
  const textColor = isRedNumber ? '#b52424' : '#1c1712';
  const pipCount = NUMBER_TOKEN_PIPS[number] ?? 0;

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#f5ead0';
  context.beginPath();
  context.arc(80, 80, 72, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = '#7a4b2a';
  context.lineWidth = 5;
  context.stroke();

  context.fillStyle = textColor;
  context.font = '800 58px Arial';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(String(number), 80, 70);

  const pipSpacing = 10;
  const startX = 80 - ((pipCount - 1) * pipSpacing) / 2;
  context.fillStyle = textColor;

  for (let index = 0; index < pipCount; index += 1) {
    context.beginPath();
    context.arc(startX + index * pipSpacing, 116, 3.2, 0, Math.PI * 2);
    context.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  return texture;
}

function createNumberTokenMesh(number) {
  const group = new THREE.Group();
  const disk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.31, 0.31, 0.035, 40),
    new THREE.MeshStandardMaterial({ color: '#f5ead0', roughness: 0.7 }),
  );
  disk.position.y = HEX_HEIGHT / 2 + 0.04;
  disk.castShadow = true;
  group.add(disk);

  const tokenFace = new THREE.Mesh(
    new THREE.PlaneGeometry(0.62, 0.62),
    new THREE.MeshBasicMaterial({
      map: createNumberTokenTexture(number),
      transparent: true,
    }),
  );
  tokenFace.rotation.x = -Math.PI / 2;
  tokenFace.position.y = HEX_HEIGHT / 2 + 0.06;
  group.add(tokenFace);

  return group;
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

  if (hex.number) {
    group.add(createNumberTokenMesh(hex.number));
  }

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

export function createResourceCardMesh() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 192;

  const context = canvas.getContext('2d');
  context.fillStyle = '#edf3ff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#173f86';
  context.fillRect(8, 8, canvas.width - 16, canvas.height - 16);
  context.strokeStyle = '#edf3ff';
  context.lineWidth = 5;
  context.strokeRect(18, 18, canvas.width - 36, canvas.height - 36);
  context.fillStyle = '#2c63ba';
  context.fillRect(34, 48, canvas.width - 68, canvas.height - 96);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const cardThickness = 0.006;
  const sideMaterial = new THREE.MeshStandardMaterial({ color: '#173f86', roughness: 0.8 });
  const topMaterial = new THREE.MeshBasicMaterial({ map: texture });
  const card = new THREE.Mesh(
    new THREE.BoxGeometry(0.78, cardThickness, 1.14),
    [sideMaterial, sideMaterial, topMaterial, sideMaterial, sideMaterial, sideMaterial],
  );
  card.position.y = cardThickness / 2;
  card.castShadow = true;
  card.receiveShadow = true;

  return card;
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
