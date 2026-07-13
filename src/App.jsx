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
import { createBoardTopology } from './game/topology.js';
import { applyAction, createGame, getPlayerView, TERRAIN_RESOURCE } from './rules/index.js';
import LiveKitTableCall from './stream/LiveKitTableCall.jsx';

const DEFAULT_PLAYER_COUNT = 4;

function rollDie() {
  return 1 + Math.floor(Math.random() * 6);
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
  const [selectedRoadBuildingEdges, setSelectedRoadBuildingEdges] = useState([]);

  const activePlayerCount = confirmedPlayers ?? selectedPlayers;
  const activePlayers = useMemo(() => getActivePlayers(activePlayerCount), [activePlayerCount]);
  const topology = useMemo(() => createBoardTopology(board.hexes), [board.hexes]);
  const ports = useMemo(() => createBoardPorts(topology, board.seed), [board.seed, topology]);
  const placements = useMemo(() => placementsFromGame(game), [game]);
  const resourceHands = useMemo(() => resourceHandsFromGame(game, activePlayers), [activePlayers, game]);
  const playerInventories = useMemo(
    () => playerInventoriesFromGame(game, activePlayers),
    [activePlayers, game],
  );
  const currentPlayer = activePlayers.find((player) => player.id === game?.currentPlayerId) ?? null;
  // Local hot-seat: view the board as the active player (pass-and-play can override later).
  const viewerId = game?.currentPlayerId ?? null;
  const playerView = usePlayerView(game, viewerId);
  const diceTotal = game?.dice ? game.dice[0] + game.dice[1] : null;
  const totalCards = resourceHands.reduce((total, hand) => total + hand.cards.length, 0);
  const interactionMode = getInteractionMode(game, requestedMode);
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

  const playerMessage = useMemo(() => {
    if (!confirmedPlayers) return 'Choose a player count to start the room setup.';
    if (!game) return `${confirmedPlayers} players selected. Start the game when ready.`;
    if (game.phase === 'setup') {
      return `${currentPlayer?.label ?? 'Current player'} places a ${game.setupSettlementId ? 'road' : 'settlement'}.`;
    }
    if (game.phase === 'roll') return `${currentPlayer?.label ?? 'Current player'} rolls the dice.`;
    if (game.phase === 'robber') return `${currentPlayer?.label ?? 'Current player'} must move the robber.`;
    if (game.phase === 'discard') return 'Players with more than seven cards must discard.';
    if (game.phase === 'gameOver') return `${currentPlayer?.label ?? 'A player'} won the game.`;
    if (game.phase === 'action') return `${currentPlayer?.label ?? 'Current player'} may build, trade, or end the turn.`;
    return 'Game started.';
  }, [confirmedPlayers, currentPlayer, game]);

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

  const dispatch = useCallback((action) => {
    setActionFeedback({ status: 'pending', message: `Applying: ${describeAction(action.type)}…` });
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
        return next;
      } catch (error) {
        setGameError(error.message);
        setActionFeedback({ status: 'error', message: error.message });
        return current;
      }
    });
  }, []);

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

  function handleConfirm(event) {
    event.preventDefault();
    setConfirmedPlayers(selectedPlayers);
    setGame(null);
    resetTransientState();
  }

  function handleStartGame() {
    if (!confirmedPlayers) return;
    const players = getActivePlayers(confirmedPlayers);
    setGame(createGame({
      board: createRulesBoard(board, topology, ports),
      players: players.map((player) => ({ ...player, name: player.label })),
    }));
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
    if (game?.phase !== 'roll') return;
    const dice = [rollDie(), rollDie()];
    setDiceRoll((current) => ({ values: dice, rollId: (current?.rollId ?? 0) + 1 }));
    dispatch({ type: 'rollDice', playerId: game.currentPlayerId, dice });
  }

  const handleSelectTarget = useCallback((targetId) => {
    if (!game || !interactionMode) return;
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
        dispatch({ type: 'playDevelopment', playerId: game.currentPlayerId, card: 'roadBuilding', edgeIds: nextEdges });
      } else {
        setSelectedRoadBuildingEdges(nextEdges);
        setActionFeedback({ status: 'idle', message: 'Select a second road or finish with one.' });
      }
      return;
    }
    const action = actionForTarget(interactionMode, game, targetId);
    if (action) dispatch(action);
  }, [dispatch, game, interactionMode, selectedRoadBuildingEdges]);
  const handlePlaceSettlement = useCallback((vertexId) => handleSelectTarget(vertexId), [handleSelectTarget]);
  const handlePlaceRoad = useCallback((edgeId) => handleSelectTarget(edgeId), [handleSelectTarget]);

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
        // Full hands for deterministic e2e; UI rendering uses playerView.
        resources: game
          ? Object.fromEntries(game.players.map((player) => [player.id, { ...player.resources }]))
          : null,
        // Build a summary from authoritative state so tests do not depend on hook timing.
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
        dispatch({ type: 'rollDice', playerId: game.currentPlayerId, dice: values });
      },
    };
    return () => { delete window.__CATAN_TEST_API; };
  }, [
    actionFeedback, board.seed, buildAvailability, cancelInteraction, confirmedPlayers, dispatch,
    eligibleRobberVictims,
    game, gameError, handlePlaceRoad, handlePlaceSettlement, handleSelectTarget, interactionMode,
    legalTargets.hexes, placementOptions.roads, placementOptions.settlements, placements.cities.length,
    placements.roads.length, placements.settlements.length, playerInventories, playerView, productionCandidates,
    selectedRoadBuildingEdges, selectedRobberTileId, topology, viewerId,
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
          productionTileIds={game?.lastProduction?.tiles.filter((tile) => tile.distributed && tile.demand > 0).map((tile) => tile.tileId) ?? []}
          pendingRoadEdgeIds={selectedRoadBuildingEdges}
        />
        <LiveKitTableCall players={activePlayers} />
        {!game && (
          <StartGameOverlay
            selectedPlayers={selectedPlayers}
            confirmedPlayers={confirmedPlayers}
            onSelectPlayers={setSelectedPlayers}
            onConfirm={handleConfirm}
            onStart={handleStartGame}
          />
        )}
        <GameOverOverlay playerView={playerView} onRestart={handleRestartGame} onNewGame={handleNewGame} />
      </section>

      <GameControlPanel
        game={game}
        playerView={playerView}
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
        onEndTurn={() => game && dispatch({ type: 'endTurn', playerId: game.currentPlayerId })}
        onSelectMode={setRequestedMode}
        onResetCamera={() => setCameraResetKey((key) => key + 1)}
        onStartGame={game ? handleRestartGame : handleStartGame}
        boardSeed={board.seed}
        currentPlayer={currentPlayer}
        selectedRobberTileId={selectedRobberTileId}
        eligibleRobberVictims={eligibleRobberVictims}
        onDiscard={(playerId, resources) => dispatch({ type: 'discard', playerId, resources })}
        onSelectVictim={(victimId) => dispatch({
          type: 'moveRobber',
          playerId: game.currentPlayerId,
          tileId: selectedRobberTileId,
          victimId,
        })}
        onChooseDifferentRobberHex={() => setSelectedRobberTileId(null)}
        onTradeAction={dispatch}
        onDevelopmentAction={dispatch}
        selectedRoadBuildingEdges={selectedRoadBuildingEdges}
        onBeginRoadBuilding={() => {
          setSelectedRoadBuildingEdges([]);
          setRequestedMode(INTERACTION_MODES.ROAD_BUILDING);
        }}
        onFinishRoadBuilding={() => dispatch({
          type: 'playDevelopment',
          playerId: game.currentPlayerId,
          card: 'roadBuilding',
          edgeIds: selectedRoadBuildingEdges,
        })}
        onCancelRoadBuilding={cancelInteraction}
      />
    </main>
  );
}

export default App;
