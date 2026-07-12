import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  createCardZoneMesh,
  createCityMesh,
  createHexTileMesh,
  createResourceCardMesh,
  createRoadHighlightMesh,
  createRoadMesh,
  createRobberMesh,
  createSettlementHighlightMesh,
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

function getPlayerColor(activePlayers, playerId) {
  return activePlayers.find((player) => player.id === playerId)?.color ?? '#ffffff';
}

function addPlacedPieces(world, activePlayers, topology, placements) {
  const placedGroup = new THREE.Group();
  placedGroup.name = 'placed-setup-pieces';

  placements.settlements.forEach((settlement) => {
    const vertex = topology.vertices.find((item) => item.id === settlement.vertexId);

    if (!vertex) {
      return;
    }

    const piece = createSettlementMesh(getPlayerColor(activePlayers, settlement.playerId));
    piece.position.set(vertex.x, 0.11, vertex.z);
    placedGroup.add(piece);
  });

  placements.roads.forEach((roadPlacement) => {
    const edge = topology.edges.find((item) => item.id === roadPlacement.edgeId);

    if (!edge) {
      return;
    }

    const road = createRoadMesh(getPlayerColor(activePlayers, roadPlacement.playerId));
    road.position.set(edge.x, 0.11, edge.z);
    road.rotation.y = edge.rotation + Math.PI / 2;
    placedGroup.add(road);
  });

  world.add(placedGroup);
}

function addPlacementHighlights(world, placementOptions, interactionTargets) {
  const highlights = new THREE.Group();
  highlights.name = 'placement-highlights';

  placementOptions.settlements.forEach((vertex) => {
    const highlight = createSettlementHighlightMesh();
    highlight.position.set(vertex.x, 0.28, vertex.z);
    highlight.userData = { placementType: 'settlement', id: vertex.id };
    interactionTargets.push(highlight);
    highlights.add(highlight);
  });

  placementOptions.roads.forEach((edge) => {
    const highlight = createRoadHighlightMesh(edge.length);
    highlight.position.set(edge.x, 0.3, edge.z);
    highlight.rotation.y = edge.rotation;
    highlight.userData = { placementType: 'road', id: edge.id };
    interactionTargets.push(highlight);
    highlights.add(highlight);
  });

  world.add(highlights);
}

const PLAYER_RACK_SPOTS = [
  { x: 0, z: 7.9, rotation: 0 },
  { x: 0, z: -7.9, rotation: Math.PI },
  { x: -8.6, z: 0, rotation: -Math.PI / 2 },
  { x: 8.6, z: 0, rotation: Math.PI / 2 },
  { x: -7.15, z: -6.9, rotation: -Math.PI * 0.75 },
  { x: 7.15, z: 6.9, rotation: Math.PI * 0.25 },
];

const CARD_AREA_WIDTH = 1.55;
const CARD_WIDTH = 0.36;
const CARD_MAX_SPACING = 0.18;
const PLAYER_TABLE_SURFACE_Y = -0.22;

function createCardStack(cards) {
  const group = new THREE.Group();
  group.name = 'face-down-resource-cards';

  const zone = createCardZoneMesh();
  group.add(zone);

  const cardCount = cards.length;
  const spacing =
    cardCount <= 1 ? 0 : Math.min(CARD_MAX_SPACING, (CARD_AREA_WIDTH - CARD_WIDTH) / (cardCount - 1));
  const startX = -((cardCount - 1) * spacing) / 2;

  cards.forEach((card, index) => {
    const cardMesh = createResourceCardMesh();
    cardMesh.name = card.id;
    cardMesh.position.set(startX + index * spacing, 0.04 + index * 0.003, 0);
    group.add(cardMesh);
  });

  return group;
}

function createPlayerArea(player, cards) {
  const playerGroup = new THREE.Group();
  playerGroup.name = `player-${player.seat}-${player.id}-area`;

  const road = createRoadMesh(player.color);
  road.position.set(-1.08, 0, 0);
  road.rotation.y = -Math.PI / 8;

  const settlement = createSettlementMesh(player.color);
  settlement.position.set(-0.6, 0, 0);

  const city = createCityMesh(player.color);
  city.position.set(-0.12, 0, 0);

  const cardStack = createCardStack(cards);
  cardStack.position.set(0.95, 0, 0);

  playerGroup.add(road, settlement, city, cardStack);

  return playerGroup;
}

function addPlayerAreas(world, activePlayers, resourceHands) {
  const rack = new THREE.Group();
  rack.name = 'player-areas';

  activePlayers.forEach((player, index) => {
    const spot = PLAYER_RACK_SPOTS[index % PLAYER_RACK_SPOTS.length];
    const cards = resourceHands.find((hand) => hand.playerId === player.id)?.cards ?? [];
    const playerGroup = createPlayerArea(player, cards);
    playerGroup.position.set(spot.x, PLAYER_TABLE_SURFACE_Y, spot.z);
    playerGroup.rotation.y = spot.rotation;

    rack.add(playerGroup);
  });

  world.add(rack);
}

function CatanScene({
  board,
  activePlayers,
  resourceHands,
  cameraResetKey,
  topology,
  placements,
  placementOptions,
  onPlaceSettlement,
  onPlaceRoad,
}) {
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
    controls.minDistance = 6;
    controls.maxDistance = 18;
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
    const interactionTargets = [];
    const animatedHighlights = [];

    const playerTable = new THREE.Mesh(
      new THREE.BoxGeometry(19, 0.12, 17),
      new THREE.MeshStandardMaterial({ color: '#7a4b2a', roughness: 0.86 }),
    );
    playerTable.position.y = -0.28;
    playerTable.receiveShadow = true;
    world.add(playerTable);

    const boardTable = new THREE.Mesh(
      new THREE.CylinderGeometry(5.8, 5.8, 0.08, 6),
      new THREE.MeshStandardMaterial({ color: '#1f6f78', roughness: 0.8 }),
    );
    boardTable.rotation.y = Math.PI / 6;
    boardTable.position.y = -0.16;
    boardTable.receiveShadow = true;
    world.add(boardTable);

    addTerrain(world, board);
    addPlacedPieces(world, activePlayers, topology, placements);
    addPlacementHighlights(world, placementOptions, interactionTargets);
    animatedHighlights.push(...interactionTargets);
    addPlayerAreas(world, activePlayers, resourceHands);
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
      camera.position.set(0, isNarrow ? 14.2 : 12.6, isNarrow ? 14.6 : 13.2);
      camera.lookAt(controls.target);
      controls.update();
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    function handlePointerDown(event) {
      if (interactionTargets.length === 0) {
        return;
      }

      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      const [hit] = raycaster.intersectObjects(interactionTargets, true);
      const placement = hit?.object?.userData;

      if (!placement) {
        return;
      }

      if (placement.placementType === 'settlement') {
        onPlaceSettlement(placement.id);
      }

      if (placement.placementType === 'road') {
        onPlaceRoad(placement.id);
      }
    }

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);

    let animationId = 0;
    let renderedFrames = 0;
    const clock = new THREE.Clock();

    function animate() {
      const elapsed = clock.getElapsedTime();
      const pulse = 1 + Math.sin(elapsed * 4) * 0.08;
      animatedHighlights.forEach((highlight) => {
        highlight.scale.setScalar(pulse);

        if (highlight.material) {
          highlight.material.opacity = 0.62 + Math.sin(elapsed * 4) * 0.16;
        }
      });

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
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      resizeObserver.disconnect();
      controls.dispose();
      if (window.__CATAN_ACTIVE_RENDER_ID === renderId) {
        window.__CATAN_RENDER_READY = false;
      }
      disposeScene(scene);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [
    activePlayers,
    board,
    cameraResetKey,
    onPlaceRoad,
    onPlaceSettlement,
    placementOptions,
    placements,
    resourceHands,
    topology,
  ]);

  return <div ref={containerRef} className="catan-scene" aria-label="3D Catan board sandbox" />;
}

export default CatanScene;
