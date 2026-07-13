import { useCallback, useEffect, useMemo, useState } from 'react';
import CatanScene from './components/CatanScene.jsx';
import GameControlPanel from './components/game/GameControlPanel.jsx';
import StartGameOverlay from './components/game/StartGameOverlay.jsx';
import GameOverOverlay from './components/game/GameOverOverlay.jsx';
import { createRandomBoard } from './game/board.js';
import { getActivePlayers } from './game/pieces.js';
import {
  actionForTarget,
  describeAction,
  findRoadPlanToSettlement,
  getBuildAvailability,
  getEligibleRobberVictims,
  getInteractionMode,
  getLegalTargets,
  INTERACTION_MODES,
} from './game/interactions.js';
import {
  createBoardPorts,
  createRulesBoard,
  placementsFromGame,
  playerInventoriesFromGame,
  resourceHandsFromGame,
} from './game/rulesAdapter.js';
import { usePlayerView } from './game/usePlayerView.js';
import {
  canHostStart,
  canParticipantAct,
  canParticipantRequestAction,
  claimSeat,
  createLobbyState,
  getParticipantPlayerId,
  getParticipantRole,
  markParticipantConnected,
  markParticipantDisconnected,
  MULTIPLAYER_MESSAGE_TYPES,
  releaseSeat,
  ROOM_STATUS,
  setLobbyPlayerCount,
  startLobbyGame,
} from './game/multiplayerRoom.js';
import { createBoardTopology } from './game/topology.js';
import { applyAction, createGame, getPlayerView, TERRAIN_RESOURCE } from './rules/index.js';
import LiveKitTableCall from './stream/LiveKitTableCall.jsx';

const DEFAULT_PLAYER_COUNT = 4;
const DATA_TOPIC = 'catan-game';
const HOST_HEARTBEAT_MS = 5000;
const HOST_TIMEOUT_MS = 16000;

function rollDie() {
  return 1 + Math.floor(Math.random() * 6);
}

function areDiceEqual(left, right) {
  return Boolean(
    Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => value === right[index]),
  );
}

function App() {
  const [selectedPlayers, setSelectedPlayers] = useState(DEFAULT_PLAYER_COUNT);
  const [confirmedPlayers, setConfirmedPlayers] = useState(null);
  const [board, setBoard] = useState(() => createRandomBoard());
  const [cameraResetKey, setCameraResetKey] = useState(0);
  const [game, setGame] = useState(null);
  const [gameError, setGameError] = useState('');
  const [diceRoll, setDiceRoll] = useState(null);
  const [requestedMode, setRequestedMode] = useState(null);
  const [actionFeedback, setActionFeedback] = useState({ status: 'idle', message: '' });
  const [selectedRobberTileId, setSelectedRobberTileId] = useState(null);
  const [localParticipant, setLocalParticipant] = useState(null);
  const [lobbyState, setLobbyState] = useState(null);
  const [outboundMessage, setOutboundMessage] = useState(null);
  const [lastHostHeartbeatAt, setLastHostHeartbeatAt] = useState(Date.now());
  const [selectedRoadBuildingEdges, setSelectedRoadBuildingEdges] = useState([]);
  const [localTestMode, setLocalTestMode] = useState(false);

  const activePlayerCount = confirmedPlayers ?? selectedPlayers;
  const activePlayers = useMemo(() => getActivePlayers(activePlayerCount), [activePlayerCount]);
  const topology = useMemo(() => createBoardTopology(board.hexes), [board.hexes]);
  const ports = useMemo(() => createBoardPorts(topology, board.seed), [board.seed, topology]);
  const placements = useMemo(() => placementsFromGame(game), [game]);
  const currentPlayer = activePlayers.find((player) => player.id === game?.currentPlayerId) ?? null;
  const isLocalTestMode = import.meta.env.DEV && localTestMode;
  const isLiveRoomConnected = Boolean(localParticipant?.connected);
  const isHost = Boolean(
    isLocalTestMode || (
      isLiveRoomConnected &&
        lobbyState?.room.hostParticipantId === localParticipant?.participantId
    ),
  );
  const viewerId = isLocalTestMode
    ? game?.currentPlayerId ?? null
    : getParticipantPlayerId(lobbyState, localParticipant?.participantId);
  const viewerRole = isLocalTestMode
    ? 'host'
    : getParticipantRole(lobbyState, localParticipant?.participantId);
  const isViewerTurn = isLocalTestMode
    ? Boolean(game)
    : canParticipantAct({ lobbyState, participantId: localParticipant?.participantId, game });
  const canStartGame = isLocalTestMode
    ? Boolean(confirmedPlayers)
    : canHostStart(lobbyState, localParticipant?.participantId);
  const playerView = usePlayerView(game, viewerId);
  // Local single-browser play keeps shared-device discard/trade UX.
  // Live multiplayer rooms always use seat-scoped privacy.
  const sharedDeviceMode = isLocalTestMode || !isLiveRoomConnected;
  const resourceHands = useMemo(
    () => resourceHandsFromGame(game, activePlayers, playerView),
    [activePlayers, game, playerView],
  );
  const playerInventories = useMemo(
    () => playerInventoriesFromGame(game, activePlayers),
    [activePlayers, game],
  );
  const diceTotal = game?.dice ? game.dice[0] + game.dice[1] : null;
  const totalCards = resourceHands.reduce((total, hand) => total + hand.cards.length, 0);
  const interactionMode = isViewerTurn ? getInteractionMode(game, requestedMode) : null;
  const eligibleRobberVictims = useMemo(
    () => selectedRobberTileId ? getEligibleRobberVictims(game, selectedRobberTileId) : [],
    [game, selectedRobberTileId],
  );
  const buildTargets = useMemo(() => ({
    road: getLegalTargets(game, topology, board, INTERACTION_MODES.PLACE_ROAD).edges,
    settlement: getLegalTargets(game, topology, board, INTERACTION_MODES.PLACE_SETTLEMENT).intersections,
    city: getLegalTargets(game, topology, board, INTERACTION_MODES.BUILD_CITY).intersections,
  }), [board, game, topology]);
  const buildAvailability = useMemo(() => getBuildAvailability(game, {
    road: buildTargets.road.length,
    settlement: buildTargets.settlement.length,
    city: buildTargets.city.length,
  }), [buildTargets, game]);
  const productionCandidates = useMemo(() => game ? Object.values(game.board.tiles)
    .filter((tile) => tile.number && tile.id !== game.board.robberTileId)
    .filter((tile) => tile.intersections.some((id) => game.board.intersections[id].building))
    .map((tile) => ({ tileId: tile.id, total: tile.number, resource: TERRAIN_RESOURCE[tile.terrain] })) : [], [game]);
  const productionTileIds = useMemo(
    () => game?.lastProduction?.tiles
      .filter((tile) => tile.distributed && tile.demand > 0)
      .map((tile) => tile.tileId) ?? [],
    [game?.lastProduction],
  );

  const playerMessage = useMemo(() => {
    if (!isLocalTestMode && lobbyState?.room.status === ROOM_STATUS.HOST_DISCONNECTED) {
      return 'Host disconnected. The room is read-only until a new game is hosted.';
    }
    if (!isLocalTestMode && !isLiveRoomConnected) return 'Join the table call to host or claim a player seat.';
    if (!confirmedPlayers) return isLocalTestMode
      ? 'Choose a player count for the local test game.'
      : 'Host chooses a player count to start the room setup.';
    if (!game && !canStartGame) return 'Waiting for all selected seats to be claimed.';
    if (!game) return isLocalTestMode
      ? `${confirmedPlayers} players selected. Start the local test game when ready.`
      : `${confirmedPlayers} players selected. Host can start the game.`;
    if (!isViewerTurn) {
      return `Waiting for ${currentPlayer?.label ?? 'the current player'}.`;
    }
    if (game.phase === 'setup') {
      return `${currentPlayer?.label ?? 'Current player'} places a ${game.setupSettlementId ? 'road' : 'settlement'}.`;
    }
    if (game.phase === 'roll') return `${currentPlayer?.label ?? 'Current player'} rolls the dice.`;
    if (game.phase === 'robber') return `${currentPlayer?.label ?? 'Current player'} must move the robber.`;
    if (game.phase === 'discard') return 'Players with more than seven cards must discard.';
    if (game.phase === 'gameOver') return `${currentPlayer?.label ?? 'A player'} won the game.`;
    if (game.phase === 'action') return `${currentPlayer?.label ?? 'Current player'} may build, trade, or end the turn.`;
    return 'Game started.';
  }, [canStartGame, confirmedPlayers, currentPlayer, game, isLiveRoomConnected, isLocalTestMode, isViewerTurn, lobbyState?.room.status]);

  const legalTargets = useMemo(
    () => {
      if (interactionMode !== INTERACTION_MODES.ROAD_BUILDING || selectedRoadBuildingEdges.length === 0) {
        return getLegalTargets(game, topology, board, interactionMode);
      }
      const preview = structuredClone(game);
      selectedRoadBuildingEdges.forEach((edgeId) => { preview.board.edges[edgeId].road = game.currentPlayerId; });
      return getLegalTargets(preview, topology, board, interactionMode);
    },
    [board, game, interactionMode, selectedRoadBuildingEdges, topology],
  );
  const placementOptions = useMemo(() => ({
    settlements: legalTargets.intersections,
    roads: legalTargets.edges,
  }), [legalTargets]);

  const sendRoomMessage = useCallback((type, payload = {}, participant = localParticipant) => {
    if (!participant?.connected) return;
    setOutboundMessage({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      topic: DATA_TOPIC,
      type,
      from: participant.participantId,
      payload,
    });
  }, [localParticipant]);

  const broadcastLobbyState = useCallback((nextLobbyState) => {
    sendRoomMessage(MULTIPLAYER_MESSAGE_TYPES.LOBBY_STATE, {
      lobbyState: nextLobbyState,
      board,
    });
  }, [board, sendRoomMessage]);

  const broadcastGameSnapshot = useCallback((nextGame, nextLobbyState = lobbyState) => {
    sendRoomMessage(MULTIPLAYER_MESSAGE_TYPES.GAME_SNAPSHOT, {
      game: nextGame,
      lobbyState: nextLobbyState,
      board,
    });
  }, [board, lobbyState, sendRoomMessage]);

  const animateDice = useCallback((values) => {
    if (!Array.isArray(values)) return;
    setDiceRoll((current) => ({ values, rollId: (current?.rollId ?? 0) + 1 }));
  }, []);

  const dispatchLocal = useCallback((action, options = {}) => {
    setActionFeedback({ status: 'pending', message: `Applying: ${describeAction(action.type)}...` });
    setGame((current) => {
      if (!current) {
        setActionFeedback({ status: 'error', message: 'Start a game before choosing an action.' });
        return current;
      }
      try {
        const next = applyAction(current, action);
        setGameError('');
        setActionFeedback({ status: 'success', message: `Success: ${describeAction(action.type)}.` });
        setRequestedMode(null);
        if (action.type === 'moveRobber') setSelectedRobberTileId(null);
        if (action.type === 'playDevelopment') setSelectedRoadBuildingEdges([]);
        if (action.type === 'rollDice') animateDice(next.dice);
        if (options.broadcast) {
          broadcastGameSnapshot(next);
        }
        return next;
      } catch (error) {
        setGameError(error.message);
        setActionFeedback({ status: 'error', message: error.message });
        return current;
      }
    });
  }, [animateDice, broadcastGameSnapshot]);

  const requestOrDispatch = useCallback((action) => {
    if (!isViewerTurn) {
      setGameError('It is not your turn.');
      setActionFeedback({ status: 'error', message: 'It is not your turn.' });
      return;
    }

    if (isLocalTestMode) {
      dispatchLocal(action);
      return;
    }

    if (isHost) {
      dispatchLocal(action, { broadcast: true });
      return;
    }

    if (!isLiveRoomConnected) {
      setGameError('Join the table call before playing.');
      setActionFeedback({ status: 'error', message: 'Join the table call before playing.' });
      return;
    }

    sendRoomMessage(MULTIPLAYER_MESSAGE_TYPES.ACTION_REQUEST, { action });
    setActionFeedback({ status: 'pending', message: `Requested: ${describeAction(action.type)}.` });
  }, [dispatchLocal, isHost, isLiveRoomConnected, isLocalTestMode, isViewerTurn, sendRoomMessage]);

  const cancelInteraction = useCallback(() => {
    setRequestedMode(null);
    setSelectedRobberTileId(null);
    setSelectedRoadBuildingEdges([]);
    setGameError('');
    setActionFeedback({ status: 'idle', message: 'Action cancelled.' });
  }, []);

  function resetTransientState(message = '') {
    setGameError('');
    setDiceRoll(null);
    setRequestedMode(null);
    setSelectedRobberTileId(null);
    setSelectedRoadBuildingEdges([]);
    setActionFeedback({ status: 'idle', message });
  }

  function resetSyncedActionState(message = '') {
    setGameError('');
    setRequestedMode(null);
    setSelectedRobberTileId(null);
    setSelectedRoadBuildingEdges([]);
    setActionFeedback({ status: 'idle', message });
  }

  function handleConfirm(event) {
    event.preventDefault();
    if (!isHost) {
      setGameError('Only the room host can set the player count.');
      setActionFeedback({ status: 'error', message: 'Only the room host can set the player count.' });
      return;
    }
    setConfirmedPlayers(selectedPlayers);
    setGame(null);
    if (lobbyState) {
      setLobbyState((current) => {
        if (!current) return current;
        const next = setLobbyPlayerCount(current, getActivePlayers(selectedPlayers), selectedPlayers);
        broadcastLobbyState(next);
        return next;
      });
    }
    resetTransientState();
  }

  function handleEnableLocalTestMode() {
    if (!import.meta.env.DEV) return;
    setLocalTestMode(true);
    setLocalParticipant(null);
    setLobbyState(null);
    setSelectedPlayers(3);
    setConfirmedPlayers(3);
    setGame(null);
    resetTransientState('Local test mode enabled.');
  }

  function handleStartGame() {
    if (!confirmedPlayers) return;
    if (game ? !isHost : !canStartGame) {
      const message = game
        ? 'Only the room host can restart the game.'
        : 'The host can start after every selected player seat is claimed.';
      setGameError(message);
      setActionFeedback({
        status: 'error',
        message,
      });
      return;
    }

    const players = getActivePlayers(confirmedPlayers);
    const nextGame = createGame({
      board: createRulesBoard(board, topology, ports),
      players: players.map((player) => ({ ...player, name: player.label })),
    });
    const nextLobbyState = lobbyState ? startLobbyGame(lobbyState) : lobbyState;
    setGame(nextGame);
    if (nextLobbyState) setLobbyState(nextLobbyState);
    sendRoomMessage(MULTIPLAYER_MESSAGE_TYPES.GAME_START, { lobbyState: nextLobbyState, game: nextGame, board });
    resetTransientState('Game started.');
  }

  function handleRestartGame() {
    if (game && !window.confirm('Restart this game on the same board? All progress will be lost.')) return;
    handleStartGame();
  }

  function handleNewGame() {
    if (game && !window.confirm('Start a new game? All progress will be lost.')) return;
    setGame(null);
    setConfirmedPlayers(null);
    setSelectedPlayers(DEFAULT_PLAYER_COUNT);
    setBoard(createRandomBoard());
    resetTransientState('Choose players for a new game.');
  }

  function handleRollDice() {
    if (game?.phase !== 'roll' || !isViewerTurn) return;
    const dice = [rollDie(), rollDie()];
    requestOrDispatch({ type: 'rollDice', playerId: game.currentPlayerId, dice });
  }

  function handleChosenDice(dice) {
    if (game?.phase !== 'roll') return;
    requestOrDispatch({ type: 'rollDice', playerId: game.currentPlayerId, dice });
  }

  function handleLoadTestBoard(seed) {
    if (!Number.isFinite(seed)) return;
    if (game && !window.confirm('Load this test board? Current game progress will be lost.')) return;
    setBoard(createRandomBoard(seed));
    setGame(null);
    resetTransientState(`Loaded deterministic board ${seed}.`);
  }

  const handleSelectTarget = useCallback((targetId) => {
    if (!game || !interactionMode || !isViewerTurn) return;
    if (interactionMode === INTERACTION_MODES.MOVE_ROBBER) {
      const victims = getEligibleRobberVictims(game, targetId);
      if (victims.length > 0) {
        setSelectedRobberTileId(targetId);
        setActionFeedback({ status: 'idle', message: 'Choose an adjacent player to rob.' });
        return;
      }
    }
    if (interactionMode === INTERACTION_MODES.ROAD_BUILDING) {
      const nextEdges = [...selectedRoadBuildingEdges, targetId];
      const roadsRemaining = game.players.find((player) => player.id === game.currentPlayerId).pieces.roads;
      if (nextEdges.length >= Math.min(2, roadsRemaining)) {
        requestOrDispatch({
          type: 'playDevelopment',
          playerId: game.currentPlayerId,
          card: 'roadBuilding',
          edgeIds: nextEdges,
        });
      } else {
        setSelectedRoadBuildingEdges(nextEdges);
        setActionFeedback({ status: 'idle', message: 'Select a second road or finish with one.' });
      }
      return;
    }
    const action = actionForTarget(interactionMode, game, targetId);
    if (action) requestOrDispatch(action);
  }, [game, interactionMode, isViewerTurn, requestOrDispatch, selectedRoadBuildingEdges]);
  const handlePlaceSettlement = useCallback((vertexId) => handleSelectTarget(vertexId), [handleSelectTarget]);
  const handlePlaceRoad = useCallback((edgeId) => handleSelectTarget(edgeId), [handleSelectTarget]);

  const handleClaimSeat = useCallback((playerId) => {
    if (!localParticipant?.connected || !lobbyState || lobbyState.room.status !== ROOM_STATUS.LOBBY) return;

    if (isHost) {
      const next = claimSeat(lobbyState, {
        playerId,
        participantId: localParticipant.participantId,
        displayName: localParticipant.displayName,
      });
      setLobbyState(next);
      broadcastLobbyState(next);
      return;
    }

    sendRoomMessage(MULTIPLAYER_MESSAGE_TYPES.CLAIM_SEAT, {
      playerId,
      participantId: localParticipant.participantId,
      displayName: localParticipant.displayName,
    });
  }, [broadcastLobbyState, isHost, lobbyState, localParticipant, sendRoomMessage]);

  const handleLocalParticipantChange = useCallback((participant) => {
    setLocalParticipant((current) => {
      if (
        current?.connected === participant.connected &&
        current?.participantId === participant.participantId &&
        current?.displayName === participant.displayName &&
        current?.playerId === participant.playerId &&
        current?.roomName === participant.roomName &&
        current?.isRoomCreator === participant.isRoomCreator
      ) {
        return current;
      }
      return participant;
    });
    if (!participant.connected) return;

    if (participant.isRoomCreator) {
      setLobbyState((current) => {
        if (current) return current;
        const initial = createLobbyState({
          roomName: participant.roomName,
          hostParticipantId: participant.participantId,
          players: activePlayers,
          playerCount: selectedPlayers,
        });
        return claimSeat(initial, {
          playerId: participant.playerId,
          participantId: participant.participantId,
          displayName: participant.displayName,
        });
      });
      setConfirmedPlayers((current) => current ?? selectedPlayers);
      return;
    }

    sendRoomMessage(MULTIPLAYER_MESSAGE_TYPES.HELLO, {
      participantId: participant.participantId,
      displayName: participant.displayName,
      playerId: participant.playerId,
    }, participant);
    sendRoomMessage(MULTIPLAYER_MESSAGE_TYPES.CLAIM_SEAT, {
      participantId: participant.participantId,
      displayName: participant.displayName,
      playerId: participant.playerId,
    }, participant);
  }, [activePlayers, selectedPlayers, sendRoomMessage]);

  const handleParticipantPresenceChange = useCallback((participants) => {
    if (!isHost || !lobbyState) return;
    const connectedIds = new Set(participants.map((participant) => participant.identity));
    setLobbyState((current) => {
      if (!current) return current;
      let next = current;
      current.seats.forEach((seat) => {
        if (seat.claimedBy && !connectedIds.has(seat.claimedBy)) {
          next = markParticipantDisconnected(next, seat.claimedBy);
        }
      });
      if (next !== current) broadcastLobbyState(next);
      return next;
    });
  }, [broadcastLobbyState, isHost, lobbyState]);

  const handleDataMessage = useCallback((message, sender) => {
    const payload = message.payload ?? {};

    if (message.type === MULTIPLAYER_MESSAGE_TYPES.LOBBY_STATE && !isHost) {
      if (!lobbyState || payload.lobbyState?.version >= lobbyState.version) {
        setLobbyState(payload.lobbyState);
        setConfirmedPlayers(payload.lobbyState?.room.playerCount ?? null);
        setSelectedPlayers(payload.lobbyState?.room.playerCount ?? DEFAULT_PLAYER_COUNT);
        if (payload.board) setBoard(payload.board);
      }
      return;
    }

    if (
      (message.type === MULTIPLAYER_MESSAGE_TYPES.GAME_START ||
        message.type === MULTIPLAYER_MESSAGE_TYPES.GAME_SNAPSHOT) &&
      !isHost
    ) {
      if (payload.lobbyState) {
        setLobbyState(payload.lobbyState);
        setConfirmedPlayers(payload.lobbyState.room.playerCount);
        setSelectedPlayers(payload.lobbyState.room.playerCount);
      }
      if (payload.board) {
        setBoard(payload.board);
      }
      if (payload.game) {
        if (Array.isArray(payload.game.dice) && !areDiceEqual(payload.game.dice, game?.dice)) {
          animateDice(payload.game.dice);
        }
        setGame(payload.game);
      }
      resetSyncedActionState('Synced with host.');
      return;
    }

    if (message.type === MULTIPLAYER_MESSAGE_TYPES.HOST_HEARTBEAT && !isHost) {
      setLastHostHeartbeatAt(Date.now());
      return;
    }

    if (message.type === MULTIPLAYER_MESSAGE_TYPES.ACTION_REJECTED && !isHost) {
      setGameError(payload.error || 'Action rejected by host.');
      setActionFeedback({ status: 'error', message: payload.error || 'Action rejected by host.' });
      return;
    }

    if (!isHost || !lobbyState) return;

    if (message.type === MULTIPLAYER_MESSAGE_TYPES.HELLO) {
      const next = markParticipantConnected(lobbyState, {
        participantId: payload.participantId || sender.participantId,
        displayName: payload.displayName || sender.displayName,
      });
      setLobbyState(next);
      broadcastLobbyState(next);
      if (game) broadcastGameSnapshot(game, next);
      return;
    }

    if (message.type === MULTIPLAYER_MESSAGE_TYPES.CLAIM_SEAT) {
      const next = claimSeat(lobbyState, {
        playerId: payload.playerId,
        participantId: payload.participantId || sender.participantId,
        displayName: payload.displayName || sender.displayName,
      });
      setLobbyState(next);
      broadcastLobbyState(next);
      return;
    }

    if (message.type === MULTIPLAYER_MESSAGE_TYPES.RELEASE_SEAT) {
      const next = releaseSeat(lobbyState, payload.participantId || sender.participantId);
      setLobbyState(next);
      broadcastLobbyState(next);
      return;
    }

    if (message.type === MULTIPLAYER_MESSAGE_TYPES.ACTION_REQUEST) {
      const action = payload.action;
      const playerId = getParticipantPlayerId(lobbyState, sender.participantId);
      if (!canParticipantRequestAction({
        lobbyState,
        participantId: sender.participantId,
        game,
        action,
      })) {
        sendRoomMessage(MULTIPLAYER_MESSAGE_TYPES.ACTION_REJECTED, {
          to: sender.participantId,
          error: 'You cannot perform that action right now.',
        });
        return;
      }
      dispatchLocal(action, { broadcast: true });
    }
  }, [
    animateDice,
    broadcastGameSnapshot,
    broadcastLobbyState,
    dispatchLocal,
    game,
    isHost,
    lobbyState,
    sendRoomMessage,
  ]);

  useEffect(() => {
    if (!isHost || !isLiveRoomConnected) return undefined;
    const interval = window.setInterval(() => {
      sendRoomMessage(MULTIPLAYER_MESSAGE_TYPES.HOST_HEARTBEAT, {});
    }, HOST_HEARTBEAT_MS);
    return () => window.clearInterval(interval);
  }, [isHost, isLiveRoomConnected, sendRoomMessage]);

  useEffect(() => {
    if (isHost || !isLiveRoomConnected || !lobbyState || lobbyState.room.status !== ROOM_STATUS.ACTIVE) {
      return undefined;
    }
    const interval = window.setInterval(() => {
      if (Date.now() - lastHostHeartbeatAt > HOST_TIMEOUT_MS) {
        setLobbyState((current) =>
          current
            ? { ...current, room: { ...current.room, status: ROOM_STATUS.HOST_DISCONNECTED } }
            : current,
        );
      }
    }, 2000);
    return () => window.clearInterval(interval);
  }, [isHost, isLiveRoomConnected, lastHostHeartbeatAt, lobbyState]);

  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    window.__CATAN_TEST_API = {
      getState: () => ({
        confirmedPlayers,
        boardSeed: board.seed,
        phase: game?.phase ?? null,
        currentPlayerId: game?.currentPlayerId ?? null,
        setupSettlementId: game?.setupSettlementId ?? null,
        settlementOptions: placementOptions.settlements.map((vertex) => vertex.id),
        roadOptions: placementOptions.roads.map((edge) => edge.id),
        hexOptions: legalTargets.hexes.map((hex) => hex.hexId),
        selectedRobberTileId,
        selectedRoadBuildingEdges: [...selectedRoadBuildingEdges],
        eligibleRobberVictims: eligibleRobberVictims.map((player) => player.id),
        robberOptions: legalTargets.hexes.map((hex) => ({
          tileId: hex.hexId,
          victimIds: getEligibleRobberVictims(game, hex.hexId).map((player) => player.id),
        })),
        robberTileId: game?.board.robberTileId ?? null,
        productionCandidates,
        lastProduction: game?.lastProduction ?? null,
        lastRobbery: game?.lastRobbery ?? null,
        developmentDeckCount: game?.developmentDeck.length ?? 0,
        developmentCards: game
          ? Object.fromEntries(game.players.map((player) => [player.id, player.developmentCards.map((card) => ({ ...card }))]))
          : null,
        playedDevelopmentThisTurn: game?.playedDevelopmentThisTurn ?? false,
        winnerId: game?.winnerId ?? null,
        longestRoadPlayerId: game?.longestRoadPlayerId ?? null,
        largestArmyPlayerId: game?.largestArmyPlayerId ?? null,
        settlementCount: placements.settlements.length,
        roadCount: placements.roads.length,
        cityCount: placements.cities.length,
        inventories: Object.fromEntries(playerInventories.map((inventory) => [inventory.playerId, { ...inventory }])),
        buildAvailability,
        settlementRoadPlan: findRoadPlanToSettlement(game, topology),
        dice: game?.dice ?? null,
        error: gameError || null,
        interactionMode,
        feedback: { ...actionFeedback },
        logLength: game?.log.length ?? 0,
        viewerId,
        viewerRole,
        isViewerTurn,
        localTestMode: isLocalTestMode,
        lobbyState,
        resources: game
          ? Object.fromEntries(game.players.map((player) => [player.id, { ...player.resources }]))
          : null,
        playerView: (() => {
          try {
            if (!game?.currentPlayerId) return null;
            const view = getPlayerView(game, game.currentPlayerId);
            return {
              viewerId: view.viewerId,
              players: view.players.map((player) => ({
                id: player.id,
                isSelf: player.isSelf,
                resourceCount: player.resourceCount,
                developmentCardCount: player.developmentCardCount,
                hasResourceBreakdown: player.resources != null,
                hasDevCards: player.developmentCards != null,
                publicVictoryPoints: player.publicVictoryPoints,
                privateVictoryPoints: player.privateVictoryPoints,
              })),
            };
          } catch (error) {
            return { error: error.message };
          }
        })(),
      }),
      placeSettlement: handlePlaceSettlement,
      placeRoad: handlePlaceRoad,
      beginInteraction: setRequestedMode,
      cancelInteraction,
      selectTarget: handleSelectTarget,
      receiveMultiplayerMessage: handleDataMessage,
      giveResources: (playerId, resources) => {
        setGame((current) => {
          if (!current) return current;
          const next = structuredClone(current);
          const player = next.players.find((item) => item.id === playerId);
          if (!player) return current;
          Object.entries(resources).forEach(([resource, amount]) => {
            player.resources[resource] += amount;
            next.bank[resource] -= amount;
          });
          return next;
        });
      },
      setBank: (resource, amount) => {
        setGame((current) => {
          if (!current) return current;
          const next = structuredClone(current);
          next.bank[resource] = amount;
          return next;
        });
      },
      giveDevelopmentCard: (playerId, type, boughtTurn = -1) => {
        setGame((current) => {
          if (!current) return current;
          const next = structuredClone(current);
          next.players.find((player) => player.id === playerId)?.developmentCards.push({ type, boughtTurn });
          return next;
        });
      },
      resetDevelopmentPlay: () => {
        setGame((current) => current ? { ...structuredClone(current), playedDevelopmentThisTurn: false, phase: 'action' } : current);
      },
      prepareVictory: (playerId) => {
        setGame((current) => {
          if (!current) return current;
          const next = structuredClone(current);
          const player = next.players.find((item) => item.id === playerId);
          if (!player || next.currentPlayerId !== playerId) return current;
          const publicPoints = getPlayerView(next, playerId).players.find((item) => item.id === playerId).publicVictoryPoints;
          while (publicPoints + player.developmentCards.filter((card) => card.type === 'victoryPoint').length < 10) {
            player.developmentCards.push({ type: 'victoryPoint', boughtTurn: -1 });
          }
          next.phase = 'action';
          return next;
        });
      },
      rollDice: (dice) => {
        if (game?.phase !== 'roll') return;
        const values = dice ?? [rollDie(), rollDie()];
        setDiceRoll((current) => ({ values, rollId: (current?.rollId ?? 0) + 1 }));
        requestOrDispatch({ type: 'rollDice', playerId: game.currentPlayerId, dice: values });
      },
    };
    return () => { delete window.__CATAN_TEST_API; };
  }, [
    actionFeedback, board.seed, buildAvailability, cancelInteraction, confirmedPlayers,
    eligibleRobberVictims, game, gameError, handleDataMessage, handlePlaceRoad, handlePlaceSettlement,
    handleSelectTarget, interactionMode, isViewerTurn, legalTargets.hexes, lobbyState,
    placementOptions.roads, placementOptions.settlements, placements.cities.length,
    placements.roads.length, placements.settlements.length, playerInventories, playerView,
    productionCandidates, requestOrDispatch, selectedRoadBuildingEdges, selectedRobberTileId,
    topology, viewerId, viewerRole,
  ]);

  return (
    <main className="app-shell">
      <section className="game-stage" aria-label="3D Catan table">
        <CatanScene
          board={board}
          activePlayers={activePlayers}
          resourceHands={resourceHands}
          playerInventories={playerInventories}
          cameraResetKey={cameraResetKey}
          topology={topology}
          ports={game?.board.ports ?? ports}
          robberTileId={game?.board.robberTileId ?? board.hexes.find((hex) => hex.hasRobber)?.hexId}
          placements={placements}
          legalTargets={legalTargets}
          interactionMode={interactionMode}
          onSelectTarget={handleSelectTarget}
          diceRoll={diceRoll}
          productionTileIds={productionTileIds}
          pendingRoadEdgeIds={selectedRoadBuildingEdges}
        />
        {!isLocalTestMode && <LiveKitTableCall
          players={activePlayers}
          claimedPlayerIds={lobbyState?.seats.filter((seat) => seat.claimedBy).map((seat) => seat.playerId) ?? []}
          outboundMessage={outboundMessage}
          onDataMessage={handleDataMessage}
          onLocalParticipantChange={handleLocalParticipantChange}
          onParticipantPresenceChange={handleParticipantPresenceChange}
        />}
        {!game && (
          <StartGameOverlay
            selectedPlayers={selectedPlayers}
            confirmedPlayers={confirmedPlayers}
            onSelectPlayers={setSelectedPlayers}
            onConfirm={handleConfirm}
            onStart={handleStartGame}
            onClaimSeat={handleClaimSeat}
            lobbyState={lobbyState}
            localParticipant={localParticipant}
            viewerRole={viewerRole}
            isHost={isHost}
            canStartGame={canStartGame}
            localTestMode={isLocalTestMode}
            onEnableLocalTestMode={import.meta.env.DEV ? handleEnableLocalTestMode : null}
          />
        )}
        <GameOverOverlay playerView={playerView} onRestart={handleRestartGame} onNewGame={handleNewGame} />
      </section>

      <GameControlPanel
        game={game}
        playerView={playerView}
        viewerId={viewerId}
        sharedDeviceMode={sharedDeviceMode}
        playerMessage={playerMessage}
        diceTotal={diceTotal}
        totalCards={totalCards}
        gameError={gameError}
        interactionMode={interactionMode}
        requestedMode={requestedMode}
        onCancelInteraction={cancelInteraction}
        actionFeedback={actionFeedback}
        confirmedPlayers={confirmedPlayers}
        buildAvailability={buildAvailability}
        onRollDice={handleRollDice}
        onEndTurn={() => game && requestOrDispatch({ type: 'endTurn', playerId: game.currentPlayerId })}
        onSelectMode={setRequestedMode}
        onResetCamera={() => setCameraResetKey((key) => key + 1)}
        onStartGame={game ? handleRestartGame : handleStartGame}
        boardSeed={board.seed}
        currentPlayer={currentPlayer}
        selectedRobberTileId={selectedRobberTileId}
        eligibleRobberVictims={eligibleRobberVictims}
        onDiscard={(playerId, resources) => requestOrDispatch({ type: 'discard', playerId, resources })}
        onSelectVictim={(victimId) => requestOrDispatch({
          type: 'moveRobber',
          playerId: game.currentPlayerId,
          tileId: selectedRobberTileId,
          victimId,
        })}
        onChooseDifferentRobberHex={() => setSelectedRobberTileId(null)}
        onTradeAction={requestOrDispatch}
        viewerRole={viewerRole}
        isViewerTurn={isViewerTurn}
        isHost={isHost}
        canStartGame={canStartGame}
        lobbyState={lobbyState}
        onDevelopmentAction={requestOrDispatch}
        selectedRoadBuildingEdges={selectedRoadBuildingEdges}
        onBeginRoadBuilding={() => {
          setSelectedRoadBuildingEdges([]);
          setRequestedMode(INTERACTION_MODES.ROAD_BUILDING);
        }}
        onFinishRoadBuilding={() => requestOrDispatch({
          type: 'playDevelopment',
          playerId: game.currentPlayerId,
          card: 'roadBuilding',
          edgeIds: selectedRoadBuildingEdges,
        })}
        onCancelRoadBuilding={cancelInteraction}
        onLoadTestBoard={handleLoadTestBoard}
        onRollChosenDice={handleChosenDice}
      />
    </main>
  );
}

export default App;
