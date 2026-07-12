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
  road.position.y = 0.12;
  road.castShadow = true;
  group.add(road);
  return group;
}

export function createSettlementMesh(color) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.28, 0.34), makeMaterial(color));
  body.position.y = 0.2;
  body.castShadow = true;

  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.22, 4), makeMaterial('#3c2a1e'));
  roof.position.y = 0.45;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;

  group.add(body, roof);
  return group;
}

export function createCityMesh(color) {
  const group = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.34, 0.38), makeMaterial(color));
  base.position.set(-0.08, 0.22, 0);
  base.castShadow = true;

  const tower = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.54, 0.28), makeMaterial(color));
  tower.position.set(0.25, 0.32, 0);
  tower.castShadow = true;

  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.2, 4), makeMaterial('#3c2a1e'));
  roof.position.set(0.25, 0.72, 0);
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;

  group.add(base, tower, roof);
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
