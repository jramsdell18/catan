import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import plasticTextureUrl from '../assets/plastic.jpg';
import woodTextureUrl from '../assets/wood.jpg';
import {
  createCityMesh,
  createDiceMesh,
  createHexHighlightMesh,
  createHexOutlineHighlightMesh,
  createHexTileMesh,
  createPortMesh,
  createResourceCardMesh,
  createRoadHighlightMesh,
  createRoadMesh,
  createRobberMesh,
  createSettlementHighlightMesh,
  createSettlementMesh,
} from '../three/meshFactories.js';

const sharedTextureCache = new Map();

function getSharedTexture(url, configureTexture, onReady) {
  let record = sharedTextureCache.get(url);

  if (!record) {
    record = {
      texture: null,
      loaded: false,
      failed: false,
      callbacks: [],
    };
    sharedTextureCache.set(url, record);

    const loader = new THREE.TextureLoader();
    record.texture = loader.load(
      url,
      () => {
        record.loaded = true;
        record.callbacks.splice(0).forEach((callback) => callback(record.texture));
      },
      undefined,
      () => {
        record.failed = true;
        record.callbacks.splice(0).forEach((callback) => callback(record.texture));
      },
    );
    record.texture.userData.sharedAsset = true;
  }

  configureTexture(record.texture);

  if (record.loaded || record.failed) {
    onReady(record.texture);
  } else {
    record.callbacks.push(onReady);
  }

  return record.texture;
}

function disposeObject3D(root) {
  root.traverse((child) => {
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

function clearGroup(group) {
  while (group.children.length > 0) {
    const child = group.children[0];
    group.remove(child);
    disposeObject3D(child);
  }
}

function fillTerrain(group, board) {
  board.hexes.forEach((hex) => {
    const tile = createHexTileMesh(hex);
    tile.position.set(hex.world.x, 0, hex.world.z);
    group.add(tile);
  });
}

function fillRobber(group, board, robberTileId) {
  const hex = board.hexes.find((item) => item.hexId === robberTileId);
  if (!hex) {
    return;
  }

  const robber = createRobberMesh();
  robber.position.set(hex.world.x, 0.18, hex.world.z);
  group.add(robber);
}

function fillPorts(group, ports, topology) {
  const verticesById = new Map(topology.vertices.map((vertex) => [vertex.id, vertex]));

  ports.forEach((port) => {
    const [a, b] = port.intersections.map((id) => verticesById.get(id));
    if (!a || !b) return;
    const edgeX = (a.x + b.x) / 2;
    const edgeZ = (a.z + b.z) / 2;
    const distance = Math.hypot(edgeX, edgeZ) || 1;
    const marker = createPortMesh(port);
    marker.name = `${port.id}-${port.resource ?? 'generic'}`;
    marker.position.set(edgeX + (edgeX / distance) * 0.7, 0.12, edgeZ + (edgeZ / distance) * 0.7);
    marker.rotation.y = -Math.atan2(edgeZ, edgeX) + Math.PI / 2;
    group.add(marker);
  });
}

function getPlayerColor(activePlayers, playerId) {
  return activePlayers.find((player) => player.id === playerId)?.color ?? '#ffffff';
}

function fillPlacedPieces(group, activePlayers, topology, placements) {
  placements.settlements.forEach((settlement) => {
    const vertex = topology.vertices.find((item) => item.id === settlement.vertexId);

    if (!vertex) {
      return;
    }

    const piece = createSettlementMesh(getPlayerColor(activePlayers, settlement.playerId));
    piece.position.set(vertex.x, 0.11, vertex.z);
    group.add(piece);
  });

  placements.cities.forEach((city) => {
    const vertex = topology.vertices.find((item) => item.id === city.vertexId);
    if (!vertex) return;
    const piece = createCityMesh(getPlayerColor(activePlayers, city.playerId));
    piece.position.set(vertex.x, 0.11, vertex.z);
    group.add(piece);
  });

  placements.roads.forEach((roadPlacement) => {
    const edge = topology.edges.find((item) => item.id === roadPlacement.edgeId);

    if (!edge) {
      return;
    }

    const road = createRoadMesh(getPlayerColor(activePlayers, roadPlacement.playerId));
    road.position.set(edge.x, 0.11, edge.z);
    road.rotation.y = edge.rotation + Math.PI / 2;
    group.add(road);
  });
}

function fillBoardHighlights(group, legalTargets, interactionMode, interactionTargets) {
  legalTargets.intersections.forEach((vertex) => {
    const highlight = createSettlementHighlightMesh();
    highlight.position.set(vertex.x, 0.28, vertex.z);
    highlight.userData = { targetType: 'intersection', id: vertex.id };
    interactionTargets.push(highlight);
    group.add(highlight);
  });

  legalTargets.edges.forEach((edge) => {
    const highlight = createRoadHighlightMesh(edge.length);
    highlight.position.set(edge.x, 0.3, edge.z);
    highlight.rotation.y = edge.rotation;
    highlight.userData = { targetType: 'edge', id: edge.id };
    interactionTargets.push(highlight);
    group.add(highlight);
  });

  legalTargets.hexes.forEach((hex) => {
    const highlight = createHexHighlightMesh();
    highlight.position.set(hex.world.x, 0.28, hex.world.z);
    highlight.userData = { targetType: 'hex', id: hex.hexId };
    interactionTargets.push(highlight);
    group.add(highlight);
  });

  group.userData.interactionMode = interactionMode;
}

function fillProductionHighlights(group, board, productionTileIds) {
  productionTileIds.forEach((tileId) => {
    const hex = board.hexes.find((item) => item.hexId === tileId);
    if (!hex) return;
    const highlight = createHexOutlineHighlightMesh();
    const baseY = 0.18;
    highlight.position.set(hex.world.x, baseY, hex.world.z);
    highlight.userData.baseY = baseY;
    highlight.userData.riseAmount = 0.035;
    group.add(highlight);
  });
}

function fillPendingRoadHighlights(group, topology, edgeIds) {
  edgeIds.forEach((edgeId) => {
    const edge = topology.edges.find((item) => item.id === edgeId);
    if (!edge) return;
    const highlight = createRoadHighlightMesh(edge.length, '#63b3ed');
    highlight.position.set(edge.x, 0.34, edge.z);
    highlight.rotation.y = edge.rotation;
    group.add(highlight);
  });
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
const DIE_TABLE_SURFACE_Y = PLAYER_TABLE_SURFACE_Y + 0.33;
const DICE_SPOTS = [
  { x: -3.55, z: 6.05 },
  { x: -2.72, z: 5.8 },
];
const DICE_TARGET_ROTATIONS = {
  1: new THREE.Euler(0, 0, 0),
  2: new THREE.Euler(-Math.PI / 2, 0, 0),
  3: new THREE.Euler(0, 0, Math.PI / 2),
  4: new THREE.Euler(0, 0, -Math.PI / 2),
  5: new THREE.Euler(Math.PI / 2, 0, 0),
  6: new THREE.Euler(Math.PI, 0, 0),
};

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

function fillPlayerAreas(group, activePlayers, resourceHands, playerInventories) {
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

    group.add(playerGroup);
  });
}

function getDiceValues(diceRoll) {
  return diceRoll?.values ?? [1, 1];
}

function fillDiceArea(group, diceRoll, animatedDice) {
  const startedAt = performance.now() / 1000;

  getDiceValues(diceRoll).forEach((value, index) => {
    const spot = DICE_SPOTS[index];
    const die = createDiceMesh();
    const targetRotation = DICE_TARGET_ROTATIONS[value] ?? DICE_TARGET_ROTATIONS[1];
    const targetPosition = new THREE.Vector3(spot.x, DIE_TABLE_SURFACE_Y, spot.z);

    die.position.copy(targetPosition);
    die.rotation.copy(targetRotation);

    if (diceRoll?.rollId) {
      const startPosition = new THREE.Vector3(
        spot.x - 0.35 + index * 0.12,
        DIE_TABLE_SURFACE_Y + 0.45,
        spot.z + 0.35 + index * 0.12,
      );
      const startRotation = new THREE.Euler(
        targetRotation.x + Math.PI * (4.5 + index),
        targetRotation.y + Math.PI * (3.5 + index),
        targetRotation.z + Math.PI * (5.5 + index),
      );

      die.position.copy(startPosition);
      die.rotation.copy(startRotation);
      animatedDice.push({
        die,
        startPosition,
        targetPosition,
        startRotation,
        targetRotation,
        startedAt,
        duration: 1.05 + index * 0.16,
      });
    }

    group.add(die);
  });
}

function createLayerGroup(name) {
  const group = new THREE.Group();
  group.name = name;
  return group;
}

function rebuildAnimatedHighlights(runtime) {
  runtime.animatedHighlights.length = 0;
  runtime.layers.highlights.children.forEach((child) => {
    runtime.animatedHighlights.push(child);
  });
  runtime.layers.production.children.forEach((child) => {
    runtime.animatedHighlights.push(child);
  });
  runtime.layers.pendingRoads.children.forEach((child) => {
    runtime.animatedHighlights.push(child);
  });
}

function publishSceneStats(runtime, snapshot) {
  window.__CATAN_SCENE_STATS = {
    renderId: runtime.renderId,
    hexes: snapshot.board.hexes.length,
    numberTokens: snapshot.board.hexes.filter((hex) => hex.number !== null).length,
    ports: snapshot.ports.length,
    robberTileId: snapshot.robberTileId,
    players: snapshot.activePlayers.length,
    placedRoads: snapshot.placements.roads.length,
    placedSettlements: snapshot.placements.settlements.length,
    placedCities: snapshot.placements.cities.length,
    productionHighlights: snapshot.productionTileIds.length,
    pendingRoads: snapshot.pendingRoadEdgeIds.length,
    dice: getDiceValues(snapshot.diceRoll),
    worldChildren: runtime.world.children.length,
  };
}

function CatanScene({
  board,
  activePlayers,
  resourceHands,
  playerInventories,
  cameraResetKey,
  topology,
  ports,
  robberTileId,
  placements,
  legalTargets,
  interactionMode,
  onSelectTarget,
  diceRoll,
  productionTileIds,
  pendingRoadEdgeIds,
}) {
  const containerRef = useRef(null);
  const cameraStateRef = useRef(null);
  const runtimeRef = useRef(null);
  const onSelectTargetRef = useRef(onSelectTarget);
  const snapshotRef = useRef(null);

  onSelectTargetRef.current = onSelectTarget;
  snapshotRef.current = {
    board,
    activePlayers,
    resourceHands,
    playerInventories,
    topology,
    ports,
    robberTileId,
    placements,
    legalTargets,
    interactionMode,
    diceRoll,
    productionTileIds,
    pendingRoadEdgeIds,
  };

  // Mount once: WebGL context, camera, lights, static tables, animation loop.
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

    const layers = {
      terrain: createLayerGroup('terrain'),
      robber: createLayerGroup('robber'),
      ports: createLayerGroup('ports'),
      pieces: createLayerGroup('placed-setup-pieces'),
      highlights: createLayerGroup('placement-highlights'),
      production: createLayerGroup('production-highlights'),
      pendingRoads: createLayerGroup('pending-road-building'),
      playerAreas: createLayerGroup('player-areas'),
      dice: createLayerGroup('dice-area'),
    };

    Object.values(layers).forEach((layer) => world.add(layer));

    const interactionTargets = [];
    const animatedHighlights = [];
    const animatedDice = [];
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

    const woodTexture = getSharedTexture(
      woodTextureUrl,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.center.set(0.5, 0.5);
        texture.rotation = Math.PI / 2;
        texture.repeat.set(1.65, 1.5);
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        texture.needsUpdate = true;
      },
      () => {
        markSceneTextureReady();
      },
    );

    const playerTableMaterial = new THREE.MeshStandardMaterial({
      color: '#b88560',
      roughness: 0.82,
      map: woodTexture,
    });

    const plasticTexture = getSharedTexture(
      plasticTextureUrl,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1.2, 1.2);
        texture.needsUpdate = true;
      },
      () => {
        markSceneTextureReady();
      },
    );

    const boardTableMaterial = new THREE.MeshStandardMaterial({
      color: '#1f6f78',
      roughness: 0.8,
      map: plasticTexture,
    });

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

    const runtime = {
      renderId,
      scene,
      camera,
      renderer,
      controls,
      world,
      layers,
      interactionTargets,
      animatedHighlights,
      animatedDice,
      hasInitializedCamera: false,
    };
    runtimeRef.current = runtime;

    // Seed layers from the latest props so the first paint is complete.
    const initial = snapshotRef.current;
    if (initial) {
      fillTerrain(layers.terrain, initial.board);
      fillRobber(layers.robber, initial.board, initial.robberTileId);
      fillPorts(layers.ports, initial.ports, initial.topology);
      fillPlacedPieces(layers.pieces, initial.activePlayers, initial.topology, initial.placements);
      fillBoardHighlights(
        layers.highlights,
        initial.legalTargets,
        initial.interactionMode,
        interactionTargets,
      );
      fillProductionHighlights(layers.production, initial.board, initial.productionTileIds);
      fillPendingRoadHighlights(layers.pendingRoads, initial.topology, initial.pendingRoadEdgeIds);
      rebuildAnimatedHighlights(runtime);
      fillPlayerAreas(
        layers.playerAreas,
        initial.activePlayers,
        initial.resourceHands,
        initial.playerInventories,
      );
      fillDiceArea(layers.dice, initial.diceRoll, animatedDice);
      publishSceneStats(runtime, initial);
    }

    const savedCameraState =
      cameraStateRef.current?.cameraResetKey === cameraResetKey ? cameraStateRef.current : null;

    function resize() {
      const { width, height } = container.getBoundingClientRect();
      const safeWidth = Math.max(width, 1);
      const safeHeight = Math.max(height, 1);

      camera.aspect = safeWidth / safeHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(safeWidth, safeHeight, false);

      if (!runtime.hasInitializedCamera) {
        if (savedCameraState) {
          camera.position.copy(savedCameraState.position);
          controls.target.copy(savedCameraState.target);
        } else {
          const isNarrow = safeWidth < 560;
          controls.target.set(0, 0.2, 0.3);
          camera.position.set(0, isNarrow ? 18.5 : 16.4, isNarrow ? 18.8 : 17.2);
          camera.lookAt(controls.target);
        }
        runtime.hasInitializedCamera = true;
      }
      controls.update();
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    function handlePointerDown(event) {
      if (runtime.interactionTargets.length === 0) {
        return;
      }

      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      const [hit] = raycaster.intersectObjects(runtime.interactionTargets, true);
      const target = hit?.object?.userData;

      if (!target?.id) {
        return;
      }
      onSelectTargetRef.current?.(target.id, target.targetType);
    }

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);

    let animationId = 0;
    let renderedFrames = 0;

    function animate() {
      const now = performance.now() / 1000;
      const pulse = 1 + Math.sin(now * 4) * 0.08;
      runtime.animatedHighlights.forEach((highlight) => {
        highlight.scale.setScalar(pulse);
        if (Number.isFinite(highlight.userData.baseY)) {
          const riseAmount = highlight.userData.riseAmount ?? 0;
          highlight.position.y = highlight.userData.baseY + ((pulse - 1) / 0.08) * riseAmount;
        }

        if (highlight.material) {
          highlight.material.opacity = 0.62 + Math.sin(now * 4) * 0.16;
        }
      });
      runtime.animatedDice.forEach((animation) => {
        const progress = Math.min((now - animation.startedAt) / animation.duration, 1);
        const eased = 1 - (1 - progress) ** 3;
        const bounce = Math.sin(progress * Math.PI) * 0.42 * (1 - progress * 0.25);

        animation.die.position.lerpVectors(animation.startPosition, animation.targetPosition, eased);
        animation.die.position.y += bounce;
        animation.die.rotation.set(
          THREE.MathUtils.lerp(animation.startRotation.x, animation.targetRotation.x, eased),
          THREE.MathUtils.lerp(animation.startRotation.y, animation.targetRotation.y, eased),
          THREE.MathUtils.lerp(animation.startRotation.z, animation.targetRotation.z, eased),
        );
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
        cameraResetKey: cameraStateRef.current?.cameraResetKey ?? cameraResetKey,
        position: camera.position.clone(),
        target: controls.target.clone(),
      };
      window.cancelAnimationFrame(animationId);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      resizeObserver.disconnect();
      controls.dispose();
      if (window.__CATAN_ACTIVE_RENDER_ID === renderId) {
        window.__CATAN_RENDER_READY = false;
      }
      disposeObject3D(scene);
      renderer.dispose();
      renderer.domElement.remove();
      runtimeRef.current = null;
    };
    // Mount once for the WebGL lifetime; layer props patch via effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional stable scene
  }, []);

  // Board hexes (static for a match once dealt).
  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    clearGroup(runtime.layers.terrain);
    fillTerrain(runtime.layers.terrain, board);
    publishSceneStats(runtime, snapshotRef.current);
  }, [board]);

  // Robber position.
  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    clearGroup(runtime.layers.robber);
    fillRobber(runtime.layers.robber, board, robberTileId);
    publishSceneStats(runtime, snapshotRef.current);
  }, [board, robberTileId]);

  // Ports (stable after setup).
  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    clearGroup(runtime.layers.ports);
    fillPorts(runtime.layers.ports, ports, topology);
    publishSceneStats(runtime, snapshotRef.current);
  }, [ports, topology]);

  // Settlements, cities, roads on the board.
  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    clearGroup(runtime.layers.pieces);
    fillPlacedPieces(runtime.layers.pieces, activePlayers, topology, placements);
    publishSceneStats(runtime, snapshotRef.current);
  }, [activePlayers, topology, placements]);

  // Legal placement / robber hex highlights + raycast targets.
  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    clearGroup(runtime.layers.highlights);
    runtime.interactionTargets.length = 0;
    fillBoardHighlights(
      runtime.layers.highlights,
      legalTargets,
      interactionMode,
      runtime.interactionTargets,
    );
    rebuildAnimatedHighlights(runtime);
    publishSceneStats(runtime, snapshotRef.current);
  }, [legalTargets, interactionMode]);

  // Production pulse after dice.
  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    clearGroup(runtime.layers.production);
    fillProductionHighlights(runtime.layers.production, board, productionTileIds);
    rebuildAnimatedHighlights(runtime);
    publishSceneStats(runtime, snapshotRef.current);
  }, [board, productionTileIds]);

  // Road Building pending edges.
  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    clearGroup(runtime.layers.pendingRoads);
    fillPendingRoadHighlights(runtime.layers.pendingRoads, topology, pendingRoadEdgeIds);
    rebuildAnimatedHighlights(runtime);
    publishSceneStats(runtime, snapshotRef.current);
  }, [topology, pendingRoadEdgeIds]);

  // Per-player card racks and piece inventories.
  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    clearGroup(runtime.layers.playerAreas);
    fillPlayerAreas(
      runtime.layers.playerAreas,
      activePlayers,
      resourceHands,
      playerInventories,
    );
    publishSceneStats(runtime, snapshotRef.current);
  }, [activePlayers, resourceHands, playerInventories]);

  // Dice faces / roll animation (startedAt-based so mid-game rolls animate).
  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    clearGroup(runtime.layers.dice);
    runtime.animatedDice.length = 0;
    fillDiceArea(runtime.layers.dice, diceRoll, runtime.animatedDice);
    publishSceneStats(runtime, snapshotRef.current);
  }, [diceRoll]);

  // Soft camera reset without tearing down the WebGL context.
  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || !runtime.hasInitializedCamera) return;

    const saved =
      cameraStateRef.current?.cameraResetKey === cameraResetKey ? cameraStateRef.current : null;

    if (saved) {
      runtime.camera.position.copy(saved.position);
      runtime.controls.target.copy(saved.target);
    } else {
      const { width } = runtime.renderer.domElement.getBoundingClientRect();
      const isNarrow = width > 0 && width < 560;
      runtime.controls.target.set(0, 0.2, 0.3);
      runtime.camera.position.set(0, isNarrow ? 18.5 : 16.4, isNarrow ? 18.8 : 17.2);
      runtime.camera.lookAt(runtime.controls.target);
    }
    runtime.controls.update();
    cameraStateRef.current = {
      cameraResetKey,
      position: runtime.camera.position.clone(),
      target: runtime.controls.target.clone(),
    };
  }, [cameraResetKey]);

  return (
    <div
      ref={containerRef}
      className="catan-scene"
      role="img"
      aria-label="Interactive 3D Catan board. Select highlighted locations with a mouse or touch."
    />
  );
}

export default CatanScene;
