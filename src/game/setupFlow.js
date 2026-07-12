export function createSetupOrder(players, startingSeat) {
  const startIndex = players.findIndex((player) => player.seat === startingSeat);
  const clockwise = [...players.slice(startIndex), ...players.slice(0, startIndex)];

  return [...clockwise, ...[...clockwise].reverse()].map((player, index) => ({
    id: `setup-turn-${index + 1}`,
    playerId: player.id,
    seat: player.seat,
    round: index < clockwise.length ? 1 : 2,
  }));
}

export function pickRandomStartingSeat(players) {
  const index = Math.floor(Math.random() * players.length);
  return players[index].seat;
}

export function getCurrentSetupTurn(setup) {
  if (!setup || setup.status !== 'placing') {
    return null;
  }

  return setup.order[setup.turnIndex] ?? null;
}

export function getSetupProgress(setup) {
  if (!setup) {
    return null;
  }

  return {
    completedTurns: setup.turnIndex,
    totalTurns: setup.order.length,
    isComplete: setup.status === 'complete',
  };
}
