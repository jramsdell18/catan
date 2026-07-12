/**
 * Browser UI flows (lobby → setup → roll / end turn).
 *
 * Run all:     npm run test:e2e:flow
 * One test:    npx playwright test tests/game-flow.spec.js -g "completes setup"
 * Headed:      npx playwright test tests/game-flow.spec.js --headed
 * Debug:       npx playwright test tests/game-flow.spec.js --debug
 *
 * See tests/README.md for the full testing guide.
 */
import { expect, test } from '@playwright/test';

async function waitForTestApi(page) {
  await page.waitForFunction(() => Boolean(window.__CATAN_TEST_API?.getState));
}

async function getTestState(page) {
  return page.evaluate(() => window.__CATAN_TEST_API.getState());
}

async function confirmPlayers(page, count = 3) {
  await page.getByTestId('player-count').selectOption(String(count));
  await page.getByTestId('set-players').click();
  await expect(page.getByTestId('player-setup-helper')).toContainText(`last confirmed: ${count}`);
  await expect(page.getByTestId('start-game')).toBeEnabled();
}

async function startGame(page) {
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('engine-phase')).toHaveText('Engine phase: setup');
  await expect(page.getByTestId('start-game')).toHaveText('Restart Game');
}

/**
 * Drive the full setup snake through the same handlers the 3D highlights use.
 * Canvas raycasts are too brittle for CI; the DEV test API calls placeSettlement/placeRoad.
 */
async function completeSetup(page) {
  // 3 players × 2 placements = 6 settlement+road pairs
  for (let step = 0; step < 6; step += 1) {
    await expect
      .poll(async () => (await getTestState(page)).phase, { timeout: 10000 })
      .toBe('setup');

    const before = await getTestState(page);
    expect(before.settlementOptions.length, `step ${step} needs settlement options`).toBeGreaterThan(
      0,
    );

    await page.evaluate((vertexId) => {
      window.__CATAN_TEST_API.placeSettlement(vertexId);
    }, before.settlementOptions[0]);

    await expect
      .poll(async () => (await getTestState(page)).setupSettlementId, { timeout: 5000 })
      .not.toBeNull();

    const mid = await getTestState(page);
    expect(mid.roadOptions.length, `step ${step} needs road options`).toBeGreaterThan(0);

    await page.evaluate((edgeId) => {
      window.__CATAN_TEST_API.placeRoad(edgeId);
    }, mid.roadOptions[0]);
  }

  await expect
    .poll(async () => (await getTestState(page)).phase, { timeout: 10000 })
    .toBe('roll');
}

test.describe('lobby and board controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForTestApi(page);
    await page.waitForFunction(() => window.__CATAN_RENDER_READY === true);
  });

  test('Start Game stays disabled until players are confirmed', async ({ page }) => {
    await expect(page.getByTestId('start-game')).toBeDisabled();
    await expect(page.getByTestId('status-message')).toContainText('Choose a player count');

    await confirmPlayers(page, 4);
    await expect(page.getByTestId('status-message')).toContainText('4 players selected');
    await expect(page.getByTestId('start-game')).toBeEnabled();
    await expect(page.getByTestId('roll-dice')).toBeDisabled();
    await expect(page.getByTestId('end-turn')).toBeDisabled();
  });

  test('randomize board changes the published seed', async ({ page }) => {
    const seedBefore = await page.getByTestId('board-seed').innerText();
    await page.getByTestId('randomize-board').click();
    await expect(page.getByTestId('board-seed')).not.toHaveText(seedBefore);
  });

  test('starting a 3-player game enters setup for the first seat', async ({ page }) => {
    await confirmPlayers(page, 3);
    await startGame(page);

    const state = await getTestState(page);
    expect(state.phase).toBe('setup');
    expect(state.currentPlayerId).toBe('red');
    expect(state.settlementOptions.length).toBeGreaterThan(0);
    expect(state.roadOptions).toEqual([]);

    await expect(page.getByTestId('status-message')).toContainText('places a settlement');
    await expect(page.getByTestId('current-player-label')).toHaveText('Red');
    await expect(page.getByTestId('player-resources')).toBeVisible();
    await expect(page.getByTestId('player-state-red')).toHaveAttribute('data-active', 'true');
  });
});

test.describe('setup snake through production turn', () => {
  test('completes setup, grants starting resources, rolls, and ends turn', async ({ page }) => {
    // Full setup snake + 3D scene is slower with stream/dice overlays on main.
    test.setTimeout(90_000);

    await page.goto('/');
    await waitForTestApi(page);
    await page.waitForFunction(() => window.__CATAN_RENDER_READY === true);

    await confirmPlayers(page, 3);
    await startGame(page);
    await completeSetup(page);

    const afterSetup = await getTestState(page);
    expect(afterSetup.phase).toBe('roll');
    expect(afterSetup.settlementCount).toBe(6);
    expect(afterSetup.roadCount).toBe(6);
    expect(afterSetup.currentPlayerId).toBe('red');

    // Flat starting grant: one of each resource per player
    for (const playerId of Object.keys(afterSetup.resources)) {
      expect(afterSetup.resources[playerId]).toMatchObject({
        wood: 1,
        brick: 1,
        ore: 1,
        hay: 1,
        sheep: 1,
      });
    }

    await expect(page.getByTestId('cards-in-play')).toHaveText('15');
    await expect(page.getByTestId('status-message')).toContainText('rolls the dice');
    await expect(page.getByTestId('roll-dice')).toBeEnabled();
    await expect(page.getByTestId('end-turn')).toBeDisabled();

    // Fixed non-7 dice via test API (same path as UI roll, but deterministic).
    await page.evaluate(() => {
      window.__CATAN_TEST_API.rollDice([2, 3]);
    });

    await expect
      .poll(async () => (await getTestState(page)).phase, { timeout: 10_000 })
      .toBe('action');

    const afterRoll = await getTestState(page);
    expect(afterRoll.dice).toEqual([2, 3]);
    await expect(page.getByTestId('last-roll')).toContainText('2 + 3 = 5');

    await expect(page.getByTestId('end-turn')).toBeEnabled();
    await page.getByTestId('end-turn').click();

    await expect
      .poll(async () => (await getTestState(page)).phase, { timeout: 10_000 })
      .toBe('roll');
    const afterEnd = await getTestState(page);
    expect(afterEnd.currentPlayerId).toBe('blue');
    await expect(page.getByTestId('player-state-blue')).toHaveAttribute('data-active', 'true');
  });

  test('restart game resets to a fresh setup phase', async ({ page }) => {
    await page.goto('/');
    await waitForTestApi(page);

    await confirmPlayers(page, 3);
    await startGame(page);

    await page.evaluate(() => {
      const state = window.__CATAN_TEST_API.getState();
      window.__CATAN_TEST_API.placeSettlement(state.settlementOptions[0]);
    });
    await expect
      .poll(async () => (await getTestState(page)).settlementCount)
      .toBe(1);

    await page.getByTestId('start-game').click();
    await expect(page.getByTestId('engine-phase')).toHaveText('Engine phase: setup');

    const restarted = await getTestState(page);
    expect(restarted.settlementCount).toBe(0);
    expect(restarted.roadCount).toBe(0);
    expect(restarted.phase).toBe('setup');
    expect(restarted.currentPlayerId).toBe('red');
  });
});
