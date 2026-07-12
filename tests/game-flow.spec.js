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

function diceForTotal(total) {
  const first = Math.max(1, total - 6);
  return [first, total - first];
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
  // Overlay hides after start; restart lives on the bottom control panel.
  await expect(page.getByTestId('restart-game')).toHaveText('Restart Game');
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
    expect(mid.interactionMode).toBe('placeRoad');
    expect(mid.feedback.status).toBe('success');
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
    expect(afterSetup.logLength).toBe(12);

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
    await expect(page.getByTestId('action-history')).toBeVisible();
    await expect(page.getByTestId('status-message')).toContainText('rolls the dice');
    await expect(page.getByTestId('roll-dice')).toBeEnabled();
    await expect(page.getByTestId('end-turn')).toBeDisabled();

    const productionCandidate = afterSetup.productionCandidates[0];
    expect(productionCandidate).toBeTruthy();
    const productionDice = diceForTotal(productionCandidate.total);
    await page.evaluate((dice) => window.__CATAN_TEST_API.rollDice(dice), productionDice);

    await expect
      .poll(async () => (await getTestState(page)).phase, { timeout: 10_000 })
      .toBe('action');

    const afterRoll = await getTestState(page);
    expect(afterRoll.dice).toEqual(productionDice);
    expect(afterRoll.logLength).toBe(13);
    expect(afterRoll.feedback.status).toBe('success');
    expect(afterRoll.lastProduction.total).toBe(productionCandidate.total);
    await expect(page.getByTestId('roll-outcome')).toBeVisible();
    await expect.poll(async () => page.evaluate(() => window.__CATAN_SCENE_STATS.productionHighlights)).toBeGreaterThan(0);

    await page.evaluate(() => window.__CATAN_TEST_API.beginInteraction('placeRoad'));
    await expect(page.getByTestId('cancel-interaction')).toBeVisible();
    expect((await getTestState(page)).interactionMode).toBe('placeRoad');
    await page.getByTestId('cancel-interaction').click();
    await expect(page.getByTestId('cancel-interaction')).toBeHidden();
    expect((await getTestState(page)).interactionMode).toBeNull();

    await expect(page.getByTestId('end-turn')).toBeEnabled();
    await page.getByTestId('end-turn').click();

    await expect
      .poll(async () => (await getTestState(page)).phase, { timeout: 10_000 })
      .toBe('roll');
    const afterEnd = await getTestState(page);
    expect(afterEnd.currentPlayerId).toBe('blue');
    await expect(page.getByTestId('player-state-blue')).toHaveAttribute('data-active', 'true');

    const shortageCandidate = afterEnd.productionCandidates[0];
    await page.evaluate(({ resource }) => window.__CATAN_TEST_API.setBank(resource, 0), shortageCandidate);
    await page.evaluate((dice) => window.__CATAN_TEST_API.rollDice(dice), diceForTotal(shortageCandidate.total));
    await expect.poll(async () => (await getTestState(page)).phase).toBe('action');
    await expect(page.getByTestId('roll-outcome')).toContainText(`Bank shortage: no ${shortageCandidate.resource}`);
  });

  test('restart game resets to a fresh setup phase', async ({ page }) => {
    await page.goto('/');
    await waitForTestApi(page);
    await page.waitForFunction(() => window.__CATAN_RENDER_READY === true);

    await confirmPlayers(page, 3);
    await startGame(page);

    await page.evaluate(() => {
      const state = window.__CATAN_TEST_API.getState();
      window.__CATAN_TEST_API.placeSettlement(state.settlementOptions[0]);
    });
    await expect
      .poll(async () => (await getTestState(page)).settlementCount)
      .toBe(1);

    await page.getByTestId('restart-game').click();
    await expect(page.getByTestId('engine-phase')).toHaveText('Engine phase: setup');

    const restarted = await getTestState(page);
    expect(restarted.settlementCount).toBe(0);
    expect(restarted.roadCount).toBe(0);
    expect(restarted.phase).toBe('setup');
    expect(restarted.currentPlayerId).toBe('red');
  });

  test('builds roads, a settlement, and a city through the action controls', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/');
    await waitForTestApi(page);
    await page.waitForFunction(() => window.__CATAN_RENDER_READY === true);
    await confirmPlayers(page, 3);
    await startGame(page);
    await completeSetup(page);
    await page.evaluate(() => window.__CATAN_TEST_API.rollDice([2, 3]));
    await expect.poll(async () => (await getTestState(page)).phase).toBe('action');

    await expect(page.getByTestId('build-road')).toContainText('1 brick + 1 wood');
    await expect(page.getByTestId('build-city')).toContainText('3 ore + 2 hay');
    await expect(page.getByTestId('build-city')).toBeDisabled();

    await page.evaluate(() => window.__CATAN_TEST_API.giveResources('red', {
      wood: 8, brick: 8, ore: 3, hay: 5, sheep: 3,
    }));
    await expect(page.getByTestId('build-city')).toBeEnabled();

    const beforeCity = await getTestState(page);
    await page.getByTestId('build-city').click();
    const cityTargets = (await getTestState(page)).settlementOptions;
    expect(cityTargets.length).toBeGreaterThan(0);
    await page.evaluate((targetId) => window.__CATAN_TEST_API.selectTarget(targetId), cityTargets[0]);
    await expect.poll(async () => (await getTestState(page)).cityCount).toBe(1);
    await expect.poll(async () => page.evaluate(() => window.__CATAN_SCENE_STATS.placedCities)).toBe(1);
    const afterCity = await getTestState(page);
    expect(afterCity.resources.red.ore).toBe(beforeCity.resources.red.ore - 3);
    expect(afterCity.resources.red.hay).toBe(beforeCity.resources.red.hay - 2);
    expect(afterCity.inventories.red.city).toBe(beforeCity.inventories.red.city - 1);
    expect(afterCity.inventories.red.settlement).toBe(beforeCity.inventories.red.settlement + 1);

    const roadPlan = afterCity.settlementRoadPlan;
    expect(roadPlan.length).toBeGreaterThan(0);
    for (const edgeId of roadPlan) {
      await page.getByTestId('build-road').click();
      const roadTargets = (await getTestState(page)).roadOptions;
      expect(roadTargets).toContain(edgeId);
      const previousRoadCount = (await getTestState(page)).roadCount;
      await page.evaluate((targetId) => window.__CATAN_TEST_API.selectTarget(targetId), edgeId);
      await expect.poll(async () => (await getTestState(page)).roadCount).toBe(previousRoadCount + 1);
    }

    const state = await getTestState(page);
    expect(state.buildAvailability.settlement.enabled).toBe(true);
    const beforeSettlement = state;
    await page.getByTestId('build-settlement').click();
    const settlementTargets = (await getTestState(page)).settlementOptions;
    expect(settlementTargets.length).toBeGreaterThan(0);
    await page.evaluate((targetId) => window.__CATAN_TEST_API.selectTarget(targetId), settlementTargets[0]);
    await expect.poll(async () => (await getTestState(page)).settlementCount)
      .toBe(beforeSettlement.settlementCount + 1);
    const afterSettlement = await getTestState(page);
    expect(afterSettlement.resources.red.wood).toBe(beforeSettlement.resources.red.wood - 1);
    expect(afterSettlement.resources.red.brick).toBe(beforeSettlement.resources.red.brick - 1);
    expect(afterSettlement.resources.red.hay).toBe(beforeSettlement.resources.red.hay - 1);
    expect(afterSettlement.resources.red.sheep).toBe(beforeSettlement.resources.red.sheep - 1);
    expect(afterSettlement.inventories.red.settlement).toBe(beforeSettlement.inventories.red.settlement - 1);
    expect(afterSettlement.phase).toBe('action');
    await expect(page.getByTestId('end-turn')).toBeEnabled();
  });

  test('resolves discards, robber movement, and victim selection after a 7', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/');
    await waitForTestApi(page);
    await confirmPlayers(page, 3);
    await startGame(page);
    await completeSetup(page);
    await page.evaluate(() => window.__CATAN_TEST_API.giveResources('blue', { wood: 4, brick: 4 }));
    await page.evaluate(() => window.__CATAN_TEST_API.rollDice([3, 4]));
    await expect.poll(async () => (await getTestState(page)).phase).toBe('discard');
    await expect(page.getByTestId('discard-workflow')).toBeVisible();

    const discardState = await getTestState(page);
    const required = discardState.resources.blue
      ? Math.floor(Object.values(discardState.resources.blue).reduce((sum, amount) => sum + amount, 0) / 2)
      : 0;
    const form = page.getByTestId('discard-form-blue');
    let remaining = required;
    for (const resource of ['wood', 'brick', 'ore', 'hay', 'sheep']) {
      const take = Math.min(remaining, discardState.resources.blue[resource]);
      for (let count = 0; count < take; count += 1) await form.getByRole('button', { name: `Add ${resource}` }).click();
      remaining -= take;
    }
    expect(remaining).toBe(0);
    await form.getByRole('button', { name: new RegExp(`Discard ${required}/${required}`) }).click();
    await expect.poll(async () => (await getTestState(page)).phase).toBe('robber');
    expect((await getTestState(page)).interactionMode).toBe('moveRobber');

    const robberState = await getTestState(page);
    const target = robberState.robberOptions.find((option) => option.victimIds.length > 0);
    expect(target).toBeTruthy();
    const victimId = target.victimIds[0];
    const victimTotalBefore = Object.values(robberState.resources[victimId]).reduce((sum, amount) => sum + amount, 0);
    await page.evaluate((tileId) => window.__CATAN_TEST_API.selectTarget(tileId), target.tileId);
    await expect(page.getByTestId(`rob-victim-${victimId}`)).toBeVisible();
    await page.getByTestId(`rob-victim-${victimId}`).click();
    await expect.poll(async () => (await getTestState(page)).phase).toBe('action');
    const afterRobbery = await getTestState(page);
    expect(afterRobbery.robberTileId).toBe(target.tileId);
    await expect.poll(async () => page.evaluate(() => window.__CATAN_SCENE_STATS.robberTileId)).toBe(target.tileId);
    expect(Object.values(afterRobbery.resources[victimId]).reduce((sum, amount) => sum + amount, 0)).toBe(victimTotalBefore - 1);
    // Viewer is the active thief: private view may name the stolen resource.
    await expect(page.getByTestId('roll-outcome')).toContainText('lost');
    await expect
      .poll(async () => (await getTestState(page)).playerView?.viewerId, { timeout: 10_000 })
      .toBe('red');
    const viewAfterRob = (await getTestState(page)).playerView;
    expect(viewAfterRob.players.find((player) => player.id === 'blue').hasResourceBreakdown).toBe(false);
    expect(viewAfterRob.players.find((player) => player.id === 'red').hasResourceBreakdown).toBe(true);
  });

  test('completes maritime and domestic trade workflows', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/');
    await waitForTestApi(page);
    await confirmPlayers(page, 3);
    await startGame(page);
    await completeSetup(page);
    await page.evaluate(() => window.__CATAN_TEST_API.rollDice([2, 3]));
    await expect.poll(async () => (await getTestState(page)).phase).toBe('action');
    await page.evaluate(() => window.__CATAN_TEST_API.giveResources('red', { sheep: 4, wood: 2 }));
    await page.evaluate(() => window.__CATAN_TEST_API.giveResources('blue', { brick: 2 }));

    await page.getByTestId('toggle-trades').click();
    await page.getByTestId('maritime-give').selectOption('sheep');
    await page.getByTestId('maritime-receive').selectOption('ore');
    const maritimeButton = page.getByTestId('maritime-trade').getByRole('button', { name: /Trade \d for 1/ });
    const ratio = Number((await maritimeButton.innerText()).match(/\d+/)[0]);
    const beforeMaritime = await getTestState(page);
    await maritimeButton.click();
    await expect.poll(async () => (await getTestState(page)).resources.red.ore).toBe(beforeMaritime.resources.red.ore + 1);
    const afterMaritime = await getTestState(page);
    expect(afterMaritime.resources.red.sheep).toBe(beforeMaritime.resources.red.sheep - ratio);

    await page.getByTestId('trade-target').selectOption('blue');
    await page.getByTestId('trade-give-wood').fill('1');
    await page.getByTestId('trade-receive-brick').fill('1');
    const beforeDomestic = await getTestState(page);
    await page.getByTestId('offer-trade').click();
    await expect(page.getByTestId('pending-trade')).toBeVisible();
    await page.getByTestId('accept-trade-blue').click();
    await expect(page.getByTestId('pending-trade')).toBeHidden();
    const afterDomestic = await getTestState(page);
    expect(afterDomestic.resources.red.wood).toBe(beforeDomestic.resources.red.wood - 1);
    expect(afterDomestic.resources.red.brick).toBe(beforeDomestic.resources.red.brick + 1);
    expect(afterDomestic.resources.blue.wood).toBe(beforeDomestic.resources.blue.wood + 1);
    expect(afterDomestic.resources.blue.brick).toBe(beforeDomestic.resources.blue.brick - 1);

    await page.getByTestId('offer-trade').click();
    await page.getByTestId('reject-trade-blue').click();
    await expect(page.getByTestId('pending-trade')).toBeHidden();
    await page.getByTestId('offer-trade').click();
    await page.getByTestId('cancel-trade').click();
    await expect(page.getByTestId('pending-trade')).toBeHidden();
  });

  test('buys and plays every development card workflow', async ({ page }) => {
    test.setTimeout(150_000);
    await page.goto('/');
    await waitForTestApi(page);
    await confirmPlayers(page, 3);
    await startGame(page);
    await completeSetup(page);
    await page.evaluate(() => window.__CATAN_TEST_API.rollDice([2, 3]));
    await expect.poll(async () => (await getTestState(page)).phase).toBe('action');
    await page.getByTestId('toggle-development').click();

    await page.evaluate(() => {
      window.__CATAN_TEST_API.giveDevelopmentCard('red', 'yearOfPlenty');
      window.__CATAN_TEST_API.giveDevelopmentCard('red', 'monopoly');
    });
    const beforePlenty = await getTestState(page);
    await page.getByLabel('Year of Plenty resource 1').selectOption('wood');
    await page.getByLabel('Year of Plenty resource 2').selectOption('brick');
    await page.getByRole('button', { name: 'Play Year of Plenty' }).click();
    await expect.poll(async () => (await getTestState(page)).resources.red.wood).toBe(beforePlenty.resources.red.wood + 1);
    expect((await getTestState(page)).resources.red.brick).toBe(beforePlenty.resources.red.brick + 1);
    await expect(page.getByRole('button', { name: 'Play Monopoly' })).toBeDisabled();

    await page.evaluate(() => {
      window.__CATAN_TEST_API.resetDevelopmentPlay();
      window.__CATAN_TEST_API.giveResources('blue', { sheep: 2 });
    });
    await page.getByLabel('Monopoly resource').selectOption('sheep');
    await page.getByRole('button', { name: 'Play Monopoly' }).click();
    await expect.poll(async () => (await getTestState(page)).resources.blue.sheep).toBe(0);
    expect((await getTestState(page)).resources.white.sheep).toBe(0);

    await page.evaluate(() => {
      window.__CATAN_TEST_API.resetDevelopmentPlay();
      window.__CATAN_TEST_API.giveDevelopmentCard('red', 'knight');
    });
    await page.getByRole('button', { name: 'Play Knight' }).click();
    await expect.poll(async () => (await getTestState(page)).phase).toBe('robber');
    const robberState = await getTestState(page);
    const robberTarget = robberState.robberOptions[0];
    await page.evaluate((tileId) => window.__CATAN_TEST_API.selectTarget(tileId), robberTarget.tileId);
    if (robberTarget.victimIds.length > 0) await page.getByTestId(`rob-victim-${robberTarget.victimIds[0]}`).click();
    await expect.poll(async () => (await getTestState(page)).phase).toBe('action');

    await page.evaluate(() => {
      window.__CATAN_TEST_API.resetDevelopmentPlay();
      window.__CATAN_TEST_API.giveDevelopmentCard('red', 'roadBuilding');
    });
    const beforeRoads = await getTestState(page);
    await page.getByRole('button', { name: 'Play Road Building' }).click();
    let roadState = await getTestState(page);
    await page.evaluate((edgeId) => window.__CATAN_TEST_API.selectTarget(edgeId), roadState.roadOptions[0]);
    await expect.poll(async () => (await getTestState(page)).selectedRoadBuildingEdges.length).toBe(1);
    roadState = await getTestState(page);
    await page.evaluate((edgeId) => window.__CATAN_TEST_API.selectTarget(edgeId), roadState.roadOptions[0]);
    await expect.poll(async () => (await getTestState(page)).roadCount).toBe(beforeRoads.roadCount + 2);
    const afterRoads = await getTestState(page);
    expect(afterRoads.resources.red.wood).toBe(beforeRoads.resources.red.wood);
    expect(afterRoads.resources.red.brick).toBe(beforeRoads.resources.red.brick);

    await page.evaluate(() => {
      window.__CATAN_TEST_API.resetDevelopmentPlay();
      window.__CATAN_TEST_API.giveDevelopmentCard('red', 'victoryPoint');
      window.__CATAN_TEST_API.giveResources('red', { ore: 1, hay: 1, sheep: 1 });
    });
    await expect(page.getByTestId('development-card-victoryPoint')).toContainText('Private victory point');
    const beforeBuy = await getTestState(page);
    await page.getByTestId('buy-development').click();
    await expect.poll(async () => (await getTestState(page)).developmentDeckCount).toBe(beforeBuy.developmentDeckCount - 1);
    const afterBuy = await getTestState(page);
    expect(afterBuy.developmentCards.red.length).toBe(beforeBuy.developmentCards.red.length + 1);
    await expect(page.getByText('Bought this turn', { exact: true })).toBeVisible();
  });
});
