import { useCallback, useEffect, useMemo, useState } from 'react';
import CatanScene from './components/CatanScene.jsx';
import GameControlPanel from './components/game/GameControlPanel.jsx';
import StartGameOverlay from './components/game/StartGameOverlay.jsx';
import { createRandomBoard } from './game/board.js';
import { getActivePlayers } from './game/pieces.js';
import {
  actionForTarget,
  describeAction,
  findRoadPlanToSettlement,
  getBuildAvailability,
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
import { createBoardTopology } from './game/topology.js';
import { applyAction, createGame } from './rules/index.js';
import LiveKitTableCall from './stream/LiveKitTableCall.jsx';

const DEFAULT_PLAYER_COUNT = 4;

function rollDie() {
  return 1 + Math.floor(Math.random() * 6);
}

function App() {
  const [selectedPlayers, setSelectedPlayers] = useState(DEFAULT_PLAYER_COUNT);
  const [confirmedPlayers, setConfirmedPlayers] = useState(null);
  const [board] = useState(() => createRandomBoard());
  const [cameraResetKey, setCameraResetKey] = useState(0);
  const [game, setGame] = useState(null);
  const [gameError, setGameError] = useState('');
  const [diceRoll, setDiceRoll] = useState(null);
  const [requestedMode, setRequestedMode] = useState(null);
  const [actionFeedback, setActionFeedback] = useState({ status: 'idle', message: '' });

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
  const diceTotal = game?.dice ? game.dice[0] + game.dice[1] : null;
  const totalCards = resourceHands.reduce((total, hand) => total + hand.cards.length, 0);
  const interactionMode = getInteractionMode(game, requestedMode);
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
    () => getLegalTargets(game, topology, board, interactionMode),
    [board, game, interactionMode, topology],
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
    setGameError('');
    setActionFeedback({ status: 'idle', message: 'Action cancelled.' });
  }, []);

  function resetTransientState(message = '') {
    setGameError('');
    setDiceRoll(null);
    setRequestedMode(null);
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

  function handleRollDice() {
    if (game?.phase !== 'roll') return;
    const dice = [rollDie(), rollDie()];
    setDiceRoll((current) => ({ values: dice, rollId: (current?.rollId ?? 0) + 1 }));
    dispatch({ type: 'rollDice', playerId: game.currentPlayerId, dice });
  }

  const handleSelectTarget = useCallback((targetId) => {
    if (!game || !interactionMode) return;
    const action = actionForTarget(interactionMode, game, targetId);
    if (action) dispatch(action);
  }, [dispatch, game, interactionMode]);
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
        resources: game
          ? Object.fromEntries(game.players.map((player) => [player.id, { ...player.resources }]))
          : null,
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
    game, gameError, handlePlaceRoad, handlePlaceSettlement, handleSelectTarget, interactionMode,
    legalTargets.hexes, placementOptions.roads, placementOptions.settlements, placements.cities.length,
    placements.roads.length, placements.settlements.length, playerInventories, topology,
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
      </section>

      <GameControlPanel
        game={game}
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
        onStartGame={handleStartGame}
        boardSeed={board.seed}
        currentPlayer={currentPlayer}
      />
    </main>
  );
}

export default App;
