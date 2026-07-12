import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import plasticTextureUrl from '../assets/plastic.jpg';
import woodTextureUrl from '../assets/wood.jpg';
import {
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
      if (material.map && !material.map.userData.sharedAsset) {
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
  { x: 0, z: 7.25, rotation: 0 },
  { x: 0, z: -7.25, rotation: Math.PI },
  { x: -7.8, z: 0, rotation: -Math.PI / 2 },
  { x: 7.8, z: 0, rotation: Math.PI / 2 },
  { x: -6.45, z: -6.25, rotation: -Math.PI * 0.75 },
  { x: 6.45, z: 6.25, rotation: Math.PI * 0.25 },
];

const CARD_AREA_WIDTH = 3.1;
const CARD_WIDTH = 0.78;
const CARD_MAX_SPACING = 0.36;
const PLAYER_TABLE_SURFACE_Y = -0.22;

function createCardStack(cards) {
  const group = new THREE.Group();
  group.name = 'face-down-resource-cards';

  const cardCount = cards.length;
  const spacing =
    cardCount <= 1 ? 0 : Math.min(CARD_MAX_SPACING, (CARD_AREA_WIDTH - CARD_WIDTH) / (cardCount - 1));
  const startX = -((cardCount - 1) * spacing) / 2;

  cards.forEach((card, index) => {
    const cardMesh = createResourceCardMesh();
    cardMesh.name = card.id;
    cardMesh.position.set(startX + index * spacing, index * 0.003, 0);
    group.add(cardMesh);
  });

  return group;
}

function createRoadInventory(player, count) {
  const group = new THREE.Group();
  group.name = 'available-roads';

  Array.from({ length: count }, (_, index) => {
    const road = createRoadMesh(player.color);
    const col = index % 5;
    const row = Math.floor(index / 5);
    const isRightSideRow = row === 2;
    const x = isRightSideRow ? 0.12 + col * 0.28 : -1.35 + col * 0.28;
    const z = isRightSideRow ? -0.95 : -1.2 + row * 0.68;
    road.position.set(x, 0, z);
    road.rotation.y = -Math.PI / 2;
    group.add(road);

    return road;
  });

  return group;
}

function createSettlementInventory(player, count) {
  const group = new THREE.Group();
  group.name = 'available-settlements';

  Array.from({ length: count }, (_, index) => {
    const settlement = createSettlementMesh(player.color);
    settlement.position.set(-1.38 + index * 0.42, 0, 0.34);
    group.add(settlement);

    return settlement;
  });

  return group;
}

function createCityInventory(player, count) {
  const group = new THREE.Group();
  group.name = 'available-cities';

  Array.from({ length: count }, (_, index) => {
    const city = createCityMesh(player.color);
    city.position.set(0.38 + index * 0.56, 0, 0.23);
    group.add(city);

    return city;
  });

  return group;
}

function createPlayerArea(player, cards, inventory) {
  const playerGroup = new THREE.Group();
  playerGroup.name = `player-${player.seat}-${player.id}-area`;

  const cardStack = createCardStack(cards);
  cardStack.position.set(2.1, 0, -0.72);

  playerGroup.add(
    createRoadInventory(player, inventory.road),
    createSettlementInventory(player, inventory.settlement),
    createCityInventory(player, inventory.city),
    cardStack,
  );

  return playerGroup;
}

function addPlayerAreas(world, activePlayers, resourceHands, playerInventories) {
  const rack = new THREE.Group();
  rack.name = 'player-areas';

  activePlayers.forEach((player, index) => {
    const spot = PLAYER_RACK_SPOTS[index % PLAYER_RACK_SPOTS.length];
    const cards = resourceHands.find((hand) => hand.playerId === player.id)?.cards ?? [];
    const inventory = playerInventories.find((item) => item.playerId === player.id) ?? {
      road: 0,
      settlement: 0,
      city: 0,
    };
    const playerGroup = createPlayerArea(player, cards, inventory);
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
  playerInventories,
  cameraResetKey,
  topology,
  placements,
  placementOptions,
  onPlaceSettlement,
  onPlaceRoad,
}) {
  const containerRef = useRef(null);
  const cameraStateRef = useRef(null);

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
    let disposed = false;
    const savedCameraState =
      cameraStateRef.current?.cameraResetKey === cameraResetKey ? cameraStateRef.current : null;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#dce9ea');

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    const renderer = new THREE.WebGLRenderer({ alpha: false, antialias: true, preserveDrawingBuffer: true });
    renderer.setClearColor(scene.background, 1);
    renderer.setClearAlpha(1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 8;
    controls.maxDistance = 24;
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
    const textureLoader = new THREE.TextureLoader();
    const requiredSceneTextures = 2;
    const sceneTextureSettleMs = 1500;
    let loadedSceneTextures = 0;
    let sceneTexturesReadyAt = null;

    function markSceneTextureReady() {
      loadedSceneTextures += 1;
      if (loadedSceneTextures >= requiredSceneTextures && sceneTexturesReadyAt === null) {
        sceneTexturesReadyAt = performance.now();
      }
    }

    const playerTableMaterial = new THREE.MeshStandardMaterial({ color: '#b88560', roughness: 0.82 });
    textureLoader.load(
      woodTextureUrl,
      (woodTexture) => {
        if (disposed) {
          woodTexture.dispose();
          return;
        }

        woodTexture.colorSpace = THREE.SRGBColorSpace;
        woodTexture.wrapS = THREE.RepeatWrapping;
        woodTexture.wrapT = THREE.RepeatWrapping;
        woodTexture.center.set(0.5, 0.5);
        woodTexture.rotation = Math.PI / 2;
        woodTexture.repeat.set(1.65, 1.5);
        woodTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        playerTableMaterial.map = woodTexture;
        playerTableMaterial.needsUpdate = true;
        markSceneTextureReady();
      },
      undefined,
      markSceneTextureReady,
    );

    const boardTableMaterial = new THREE.MeshStandardMaterial({ color: '#1f6f78', roughness: 0.8 });
    textureLoader.load(
      plasticTextureUrl,
      (plasticTexture) => {
        if (disposed) {
          plasticTexture.dispose();
          return;
        }

        plasticTexture.colorSpace = THREE.SRGBColorSpace;
        plasticTexture.wrapS = THREE.RepeatWrapping;
        plasticTexture.wrapT = THREE.RepeatWrapping;
        plasticTexture.repeat.set(1.2, 1.2);
        boardTableMaterial.map = plasticTexture;
        boardTableMaterial.needsUpdate = true;
        markSceneTextureReady();
      },
      undefined,
      markSceneTextureReady,
    );

    const playerTable = new THREE.Mesh(
      new THREE.BoxGeometry(57, 0.12, 51),
      playerTableMaterial,
    );
    playerTable.position.y = -0.28;
    playerTable.receiveShadow = true;
    world.add(playerTable);

    const boardTable = new THREE.Mesh(
      new THREE.CylinderGeometry(5.8, 5.8, 0.2, 6),
      boardTableMaterial,
    );
    boardTable.rotation.y = Math.PI / 6;
    boardTable.position.y = -0.02;
    boardTable.receiveShadow = true;
    world.add(boardTable);

    addTerrain(world, board);
    addPlacedPieces(world, activePlayers, topology, placements);
    addPlacementHighlights(world, placementOptions, interactionTargets);
    animatedHighlights.push(...interactionTargets);
    addPlayerAreas(world, activePlayers, resourceHands, playerInventories);
    window.__CATAN_SCENE_STATS = {
      renderId,
      hexes: board.hexes.length,
      players: activePlayers.length,
      worldChildren: world.children.length,
    };

    let hasInitializedCamera = false;

    function resize() {
      const { width, height } = container.getBoundingClientRect();
      const safeWidth = Math.max(width, 1);
      const safeHeight = Math.max(height, 1);

      camera.aspect = safeWidth / safeHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(safeWidth, safeHeight, false);

      if (!hasInitializedCamera) {
        if (savedCameraState) {
          camera.position.copy(savedCameraState.position);
          controls.target.copy(savedCameraState.target);
        } else {
          const isNarrow = safeWidth < 560;
          controls.target.set(0, 0.2, 0.3);
          camera.position.set(0, isNarrow ? 18.5 : 16.4, isNarrow ? 18.8 : 17.2);
          camera.lookAt(controls.target);
        }
        hasInitializedCamera = true;
      }
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

    function animate() {
      const elapsed = performance.now() / 1000;
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
      window.__CATAN_RENDER_READY =
        sceneTexturesReadyAt !== null &&
        performance.now() - sceneTexturesReadyAt > sceneTextureSettleMs &&
        renderedFrames >= 2;
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
      cameraStateRef.current = {
        cameraResetKey,
        position: camera.position.clone(),
        target: controls.target.clone(),
      };
      disposed = true;
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
    playerInventories,
    resourceHands,
    topology,
  ]);

  return <div ref={containerRef} className="catan-scene" aria-label="3D Catan board sandbox" />;
}

export default CatanScene;
