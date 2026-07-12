import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  createCityMesh,
  createHexTileMesh,
  createRoadMesh,
  createRobberMesh,
  createSettlementMesh,
} from '../three/meshFactories.js';

function disposeScene(scene) {
  scene.traverse((child) => {
    if (!child.isMesh && !child.isSprite && !child.isLine) {
      return;
    }

    if (child.geometry) {
      child.geometry.dispose();
    }

    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.filter(Boolean).forEach((material) => {
      if (material.map) {
        material.map.dispose();
      }

      material.dispose();
    });
  });
}

function addTerrain(world, board) {
  board.hexes.forEach((hex) => {
    const tile = createHexTileMesh(hex);
    tile.position.set(hex.world.x, 0, hex.world.z);
    world.add(tile);

    if (hex.hasRobber) {
      const robber = createRobberMesh();
      robber.position.set(hex.world.x, 0.18, hex.world.z);
      world.add(robber);
    }
  });
}

const PLAYER_RACK_SPOTS = [
  { x: 0, z: 4.65, rotation: 0 },
  { x: 0, z: -4.65, rotation: Math.PI },
  { x: -4.85, z: 0, rotation: -Math.PI / 2 },
  { x: 4.85, z: 0, rotation: Math.PI / 2 },
  { x: -3.55, z: -3.55, rotation: -Math.PI * 0.75 },
  { x: 3.55, z: 3.55, rotation: Math.PI * 0.25 },
];

function createPlayerPieceRack(player) {
  const playerGroup = new THREE.Group();
  playerGroup.name = `player-${player.seat}-${player.id}-pieces`;

  const road = createRoadMesh(player.color);
  road.position.set(-0.48, 0, 0);
  road.rotation.y = -Math.PI / 8;

  const settlement = createSettlementMesh(player.color);
  settlement.position.set(0, 0, 0);

  const city = createCityMesh(player.color);
  city.position.set(0.5, 0, 0);
  city.scale.setScalar(0.92);

  playerGroup.add(road, settlement, city);

  return playerGroup;
}

function addPieceRack(world, activePlayers) {
  const rack = new THREE.Group();
  rack.name = 'player-piece-racks';

  activePlayers.forEach((player, index) => {
    const spot = PLAYER_RACK_SPOTS[index % PLAYER_RACK_SPOTS.length];
    const playerGroup = createPlayerPieceRack(player);
    playerGroup.position.set(spot.x, 0.2, spot.z);
    playerGroup.rotation.y = spot.rotation;

    rack.add(playerGroup);
  });

  world.add(rack);
}

function CatanScene({ board, activePlayers, cameraResetKey }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return undefined;
    }

    const renderId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;

    window.__CATAN_RENDER_READY = false;
    window.__CATAN_RENDER_STATS = null;
    window.__CATAN_ACTIVE_RENDER_ID = renderId;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#dce9ea');

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 5;
    controls.maxDistance = 13;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.target.set(0, 0.2, 0.3);

    const ambient = new THREE.HemisphereLight('#ffffff', '#7d8370', 1.9);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight('#ffffff', 2.2);
    keyLight.position.set(4, 8, 5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    scene.add(keyLight);

    const world = new THREE.Group();
    world.name = 'catan-world';
    scene.add(world);

    const table = new THREE.Mesh(
      new THREE.CylinderGeometry(5.8, 5.8, 0.08, 6),
      new THREE.MeshStandardMaterial({ color: '#1f6f78', roughness: 0.8 }),
    );
    table.rotation.y = Math.PI / 6;
    table.position.y = -0.18;
    table.receiveShadow = true;
    world.add(table);

    addTerrain(world, board);
    addPieceRack(world, activePlayers);
    window.__CATAN_SCENE_STATS = {
      renderId,
      hexes: board.hexes.length,
      players: activePlayers.length,
      worldChildren: world.children.length,
    };

    function resize() {
      const { width, height } = container.getBoundingClientRect();
      const safeWidth = Math.max(width, 1);
      const safeHeight = Math.max(height, 1);

      camera.aspect = safeWidth / safeHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(safeWidth, safeHeight, false);

      const isNarrow = safeWidth < 560;
      camera.position.set(0, isNarrow ? 9.6 : 8.2, isNarrow ? 9.8 : 8.4);
      camera.lookAt(controls.target);
      controls.update();
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    let animationId = 0;
    let renderedFrames = 0;

    function animate() {
      controls.update();
      renderer.render(scene, camera);
      renderedFrames += 1;
      window.__CATAN_RENDER_READY = true;
      window.__CATAN_RENDER_STATS = {
        renderId,
        frames: renderedFrames,
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        camera: {
          x: camera.position.x,
          y: camera.position.y,
          z: camera.position.z,
        },
      };
      animationId = window.requestAnimationFrame(animate);
    }

    animate();

    return () => {
      window.cancelAnimationFrame(animationId);
      resizeObserver.disconnect();
      controls.dispose();
      if (window.__CATAN_ACTIVE_RENDER_ID === renderId) {
        window.__CATAN_RENDER_READY = false;
      }
      disposeScene(scene);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [activePlayers, board, cameraResetKey]);

  return <div ref={containerRef} className="catan-scene" aria-label="3D Catan board sandbox" />;
}

export default CatanScene;
