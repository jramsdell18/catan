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

async function openSettings(page) {
  if (!(await page.getByTestId('settings-menu').isVisible())) await page.getByTestId('settings-toggle').click();
  await expect(page.getByTestId('settings-menu')).toBeVisible();
}

async function enableLocalTestMode(page) {
  await openSettings(page);
  await page.getByTestId('enable-local-test-mode').click();
  await expect(page.getByTestId('local-test-mode')).toBeVisible();
  await expect.poll(async () => (await getTestState(page)).localTestMode).toBe(true);
}

function diceForTotal(total) {
  const first = Math.max(1, total - 6);
  return [first, total - first];
}

async function confirmPlayers(page, count = 3) {
  await enableLocalTestMode(page);
  await page.getByTestId(`player-count-${count}`).click();
  await expect(page.getByTestId(`player-count-${count}`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('player-setup-helper')).toContainText(`All ${count} seats`);
  await expect(page.getByTestId('start-game')).toBeEnabled();
}

async function startGame(page) {
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('engine-phase')).toHaveText('Engine phase: setup');
  // The lobby card hides after start; restart lives in the settings menu.
  await expect(page.getByTestId('start-game')).toHaveCount(0);
}

async function startSoloGame(page, count = 3) {
  await openSettings(page);
  await page.getByTestId(`settings-solo-count-${count}`).click();
  await page.getByTestId('settings-start-solo').click();
  await expect(page.getByTestId('settings-menu')).toHaveCount(0);
  await expect.poll(async () => (await getTestState(page)).phase).toBe('setup');
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

  test('first visit shows only the name card and a small settings gear', async ({ page }) => {
    await expect(page.getByTestId('lobby-join')).toBeVisible();
    await expect(page.getByTestId('lobby-join')).toContainText('Host a game');
    await expect(page.getByTestId('settings-toggle')).toBeVisible();
    await expect(page.getByTestId('settings-toggle')).toHaveAccessibleName('Settings');
    // No lobby controls, solo panel, or turn buttons until they are relevant.
    await expect(page.getByTestId('start-game')).toHaveCount(0);
    await expect(page.getByTestId('enable-solo-bots')).toHaveCount(0);
    await expect(page.getByTestId('roll-dice')).toHaveCount(0);
    await expect(page.getByTestId('end-turn')).toHaveCount(0);
    expect(await page.locator('button:visible').count()).toBeLessThanOrEqual(2);

    await confirmPlayers(page, 4);
    await expect(page.getByTestId('start-game')).toBeEnabled();
    await expect(page.getByTestId('roll-dice')).toHaveCount(0);
  });

  test('settings gear sits in the bottom-right corner clear of the game buttons', async ({ page }) => {
    test.setTimeout(90_000);
    await confirmPlayers(page, 3);
    await startGame(page);
    await completeSetup(page);
    const viewport = page.viewportSize();
    const gear = await page.getByTestId('settings-toggle').boundingBox();
    expect(gear.x + gear.width).toBeGreaterThan(viewport.width - 40);
    expect(gear.y + gear.height).toBeGreaterThan(viewport.height - 40);
    const roll = await page.getByTestId('roll-dice').boundingBox();
    const overlaps = !(roll.x + roll.width <= gear.x || gear.x + gear.width <= roll.x
      || roll.y + roll.height <= gear.y || gear.y + gear.height <= roll.y);
    expect(overlaps).toBe(false);
    await openSettings(page);
    await expect(page.getByTestId('reset-camera')).toBeVisible();
    await expect(page.getByTestId('restart-game')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('settings-menu')).toHaveCount(0);
  });

  test('starting a 3-player game enters setup for the first seat', async ({ page }) => {
    await confirmPlayers(page, 3);
    await startGame(page);

    const state = await getTestState(page);
    expect(state.phase).toBe('setup');
    expect(state.currentPlayerId).toBe('red');
    expect(state.settlementOptions.length).toBeGreaterThan(0);
    expect(state.roadOptions).toEqual([]);

    await expect(page.getByTestId('status-message')).toContainText('place your settlement');
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

    await expect(page.getByTestId('status-message')).toContainText('roll the dice');
    // Exactly one highlighted primary action for the phase.
    await expect(page.getByTestId('roll-dice')).toBeVisible();
    await expect(page.getByTestId('end-turn')).toHaveCount(0);
    await expect(page.getByTestId('toggle-build')).toHaveCount(0);

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

    page.once('dialog', (dialog) => dialog.accept());
    await openSettings(page);
    await page.getByTestId('restart-game').click();
    await expect(page.getByTestId('engine-phase')).toHaveText('Engine phase: setup');

    const restarted = await getTestState(page);
    expect(restarted.settlementCount).toBe(0);
    expect(restarted.roadCount).toBe(0);
    expect(restarted.phase).toBe('setup');
    expect(restarted.currentPlayerId).toBe('red');
  });

  test('shows scoring and completes a rules-validated victory', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/');
    await waitForTestApi(page);
    await confirmPlayers(page, 3);
    await startGame(page);
    await completeSetup(page);

    await expect(page.getByTestId('scoreboard')).toHaveCount(0);
    await expect(page.getByTestId('player-public-vp-red')).toContainText('2');
    await expect(page.getByTestId('player-development-count-red')).toContainText('0');

    await page.evaluate(() => window.__CATAN_TEST_API.prepareVictory('red'));
    await expect(page.getByTestId('player-public-vp-red')).toContainText('10');
    await page.getByTestId('end-turn').click();
    await expect.poll(async () => (await getTestState(page)).phase).toBe('gameOver');
    expect((await getTestState(page)).winnerId).toBe('red');
    await expect(page.getByTestId('game-over')).toContainText('Red wins!');
    await expect(page.getByTestId('final-score-red')).toContainText('10 private VP');

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByTestId('new-game').click();
    await expect(page.getByTestId('start-game')).toBeDisabled();
    expect((await getTestState(page)).phase).toBeNull();
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

    // One Build button: builds you can make are buttons, the rest are cost reminders (never disabled buttons).
    const oreNow = (await getTestState(page)).resources.red.ore;
    await page.evaluate((ore) => window.__CATAN_TEST_API.giveResources('red', { ore: -ore }), oreNow);
    await page.getByTestId('toggle-build').click();
    await expect(page.getByTestId('build-menu')).toBeVisible();
    await expect(page.getByTestId('build-city')).toHaveCount(0);
    await expect(page.getByTestId('build-need-city')).toContainText('City');
    await expect(page.getByTestId('build-need-city')).toHaveAttribute('title', 'Build city: 3 ore + 2 hay. Not enough resources.');
    await expect(page.locator('[data-testid="build-menu"] button:disabled')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('build-menu')).toHaveCount(0);

    await page.evaluate(() => window.__CATAN_TEST_API.giveResources('red', {
      wood: 8, brick: 8, ore: 3, hay: 5, sheep: 3,
    }));
    await page.getByTestId('toggle-build').click();
    await expect(page.getByTestId('build-city')).toBeVisible();
    await expect(page.getByTestId('build-city').locator('svg')).toHaveCount(1);
    await expect(page.getByTestId('build-city')).toHaveAccessibleName('Build city: 3 ore + 2 hay');
    await expect(page.getByTestId('build-city')).toHaveAttribute('title', 'Build city: 3 ore + 2 hay');
    await expect(page.getByTestId('build-road')).toHaveAccessibleName('Build road: 1 brick + 1 wood');

    const beforeCity = await getTestState(page);
    await page.getByTestId('build-city').click();
    await expect(page.getByTestId('build-menu')).toHaveCount(0);
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
      await page.getByTestId('toggle-build').click();
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
    await page.getByTestId('toggle-build').click();
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

  test('completes bank and multi-recipient player trades through the swap-icon flow', async ({ page }) => {
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

    // Bank / port trade.
    await expect(page.getByTestId('toggle-trades')).toHaveAccessibleName('Trade resources');
    await page.getByTestId('toggle-trades').click();
    await page.getByTestId('trade-bank').click();
    await page.getByTestId('trade-bank-give-sheep').click();
    await page.getByTestId('trade-bank-get-ore').click();
    const bankButton = page.getByTestId('trade-bank-confirm');
    const ratio = Number((await bankButton.innerText()).match(/\d+/)[0]);
    const beforeMaritime = await getTestState(page);
    await bankButton.click();
    await expect.poll(async () => (await getTestState(page)).resources.red.ore).toBe(beforeMaritime.resources.red.ore + 1);
    const afterMaritime = await getTestState(page);
    expect(afterMaritime.resources.red.sheep).toBe(beforeMaritime.resources.red.sheep - ratio);
    await expect(page.getByTestId('trade-flow')).toHaveCount(0);

    // Quantities: each tap adds one, capped at what the player owns; minus removes one.
    await page.getByTestId('toggle-trades').click();
    const ownedWood = afterMaritime.resources.red.wood;
    for (let tap = 0; tap < ownedWood; tap += 1) await page.getByTestId('trade-give-wood').click();
    await expect(page.getByTestId('trade-give-wood-count')).toHaveText(String(ownedWood));
    await expect(page.getByTestId('trade-give-wood')).toBeDisabled();
    for (let tap = 1; tap < ownedWood; tap += 1) await page.getByTestId('trade-give-wood-minus').click();
    await expect(page.getByTestId('trade-give-wood-count')).toHaveText('1');
    await expect(page.getByTestId('trade-next')).toBeDisabled();
    await page.getByTestId('trade-get-brick').click();
    await page.getByTestId('trade-next').click();

    // Recipient multi-select with an "All players" shortcut and public hand counts.
    await expect(page.getByTestId('trade-hand-count-blue')).toContainText('cards');
    await page.getByTestId('trade-recipient-all').click();
    await expect(page.getByTestId('trade-recipient-blue')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('trade-recipient-white')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('trade-recipient-white').click();
    await expect(page.getByTestId('trade-recipient-white')).toHaveAttribute('aria-pressed', 'false');
    const beforeDomestic = await getTestState(page);
    await page.getByTestId('offer-trade').click();
    await expect(page.getByTestId('pending-trade')).toBeVisible();
    expect((await getTestState(page)).tradeOffer.toPlayerIds).toEqual(['blue']);
    await page.getByTestId('accept-trade-blue').click();
    await expect(page.getByTestId('trade-result')).toHaveAttribute('data-result', 'accepted');
    const afterDomestic = await getTestState(page);
    expect(afterDomestic.resources.red.wood).toBe(beforeDomestic.resources.red.wood - 1);
    expect(afterDomestic.resources.red.brick).toBe(beforeDomestic.resources.red.brick + 1);
    expect(afterDomestic.resources.blue.wood).toBe(beforeDomestic.resources.blue.wood + 1);
    expect(afterDomestic.resources.blue.brick).toBe(beforeDomestic.resources.blue.brick - 1);
    await page.getByTestId('trade-done').click();
    await expect(page.getByTestId('trade-flow')).toHaveCount(0);

    async function sendOfferToAll() {
      await page.getByTestId('toggle-trades').click();
      await page.getByTestId('trade-give-wood').click();
      await page.getByTestId('trade-get-brick').click();
      await page.getByTestId('trade-next').click();
      await page.getByTestId('trade-recipient-all').click();
      await page.getByTestId('offer-trade').click();
      await expect(page.getByTestId('pending-trade')).toBeVisible();
    }

    // Each recipient's decline is shown to the sender; the offer closes when everyone declines.
    await sendOfferToAll();
    await page.getByTestId('reject-trade-blue').click();
    await expect(page.getByTestId('trade-response-blue')).toHaveAttribute('data-response', 'declined');
    await expect(page.getByTestId('pending-trade')).toBeVisible();
    await page.getByTestId('reject-trade-white').click();
    await expect(page.getByTestId('trade-result')).toHaveAttribute('data-result', 'rejected');
    await page.getByTestId('trade-done').click();

    await sendOfferToAll();
    await page.getByTestId('cancel-trade').click();
    await expect(page.getByTestId('trade-result')).toHaveAttribute('data-result', 'cancelled');
    await page.getByTestId('trade-done').click();
    expect((await getTestState(page)).tradeOffer).toBeNull();
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

test('solo bot mode: bots place, roll, and end turns automatically', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/');
  await waitForTestApi(page);
  // Bots are switched on from the small settings menu, which turns the lobby card into solo setup.
  await openSettings(page);
  await page.getByTestId('settings-bots').click();
  await expect(page.getByTestId('settings-bots')).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('solo-bot-mode')).toBeVisible();
  await page.getByTestId('player-count-3').click();
  await expect(page.getByTestId('player-setup-helper')).toContainText('You play Red with 2 bots');
  await page.getByTestId('start-game').click();

  const state = await getTestState(page);
  expect(state.soloBotMode).toBe(true);
  expect(state.botPlayerIds).toEqual(['blue', 'white']);
  expect(state.viewerId).toBe('red');

  // The human places their own setup pieces; bots fill in the rest of the snake.
  for (let placement = 0; placement < 2; placement += 1) {
    await expect.poll(async () => {
      const current = await getTestState(page);
      return current.phase === 'setup' && current.currentPlayerId === 'red' && !current.setupSettlementId;
    }, { timeout: 20000 }).toBe(true);
    const beforeSettlement = await getTestState(page);
    await page.evaluate((id) => window.__CATAN_TEST_API.placeSettlement(id), beforeSettlement.settlementOptions[0]);
    await expect.poll(async () => (await getTestState(page)).setupSettlementId).not.toBeNull();
    const beforeRoad = await getTestState(page);
    await page.evaluate((id) => window.__CATAN_TEST_API.placeRoad(id), beforeRoad.roadOptions[0]);
  }

  await expect.poll(async () => (await getTestState(page)).phase, { timeout: 20000 }).toBe('roll');
  const afterSetup = await getTestState(page);
  expect(afterSetup.currentPlayerId).toBe('red');
  expect(afterSetup.settlementCount).toBe(6);
  expect(afterSetup.roadCount).toBe(6);

  await page.evaluate(() => window.__CATAN_TEST_API.rollDice([2, 3]));
  await expect.poll(async () => (await getTestState(page)).phase).toBe('action');
  await page.getByTestId('end-turn').click();

  // Both bots roll and end their turns without input, returning control to the human.
  await expect.poll(async () => {
    const current = await getTestState(page);
    return current.phase === 'roll' && current.currentPlayerId === 'red' && current.logLength >= 18;
  }, { timeout: 20000 }).toBe(true);
});

test('solo bot mode: bots answer offers, can propose to the human, and actions show toasts', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/');
  await waitForTestApi(page);
  await startSoloGame(page, 3);

  for (let placement = 0; placement < 2; placement += 1) {
    await expect.poll(async () => {
      const current = await getTestState(page);
      return current.phase === 'setup' && current.currentPlayerId === 'red' && !current.setupSettlementId;
    }, { timeout: 20000 }).toBe(true);
    const beforeSettlement = await getTestState(page);
    await page.evaluate((id) => window.__CATAN_TEST_API.placeSettlement(id), beforeSettlement.settlementOptions[0]);
    if (placement === 0) {
      // A colour-coded toast appears for the action, then fades away on its own.
      const toast = page.getByTestId('game-toast').filter({ hasText: 'Red placed a settlement' });
      await expect(toast).toBeVisible();
      await expect(toast).toHaveAttribute('data-player-id', 'red');
      await expect(toast).toHaveCount(0, { timeout: 6000 });
    }
    await expect.poll(async () => (await getTestState(page)).setupSettlementId).not.toBeNull();
    const beforeRoad = await getTestState(page);
    await page.evaluate((id) => window.__CATAN_TEST_API.placeRoad(id), beforeRoad.roadOptions[0]);
  }
  await expect.poll(async () => (await getTestState(page)).phase, { timeout: 20000 }).toBe('roll');
  await page.evaluate(() => window.__CATAN_TEST_API.rollDice([2, 3]));
  await expect.poll(async () => (await getTestState(page)).phase).toBe('action');
  await page.evaluate(() => window.__CATAN_TEST_API.giveResources('red', { wood: 3 }));

  // Offer to every bot: bots that cannot pay decline automatically; a bot that can pay accepts.
  await page.getByTestId('toggle-trades').click();
  await page.getByTestId('trade-give-wood').click();
  for (let tap = 0; tap < 5; tap += 1) await page.getByTestId('trade-get-ore').click();
  await page.getByTestId('trade-next').click();
  await page.getByTestId('trade-recipient-all').click();
  await page.getByTestId('offer-trade').click();
  await expect(page.getByTestId('trade-result')).toHaveAttribute('data-result', 'rejected', { timeout: 10000 });
  await expect(page.getByTestId('trade-result')).toContainText('Declined: Blue (bot), White (bot)');
  await page.getByTestId('trade-done').click();

  await page.getByTestId('toggle-trades').click();
  await page.getByTestId('trade-give-wood').click();
  await page.getByTestId('trade-get-sheep').click();
  await page.getByTestId('trade-next').click();
  await page.getByTestId('trade-recipient-all').click();
  await page.getByTestId('offer-trade').click();
  await expect(page.getByTestId('trade-result')).toHaveAttribute('data-result', 'accepted', { timeout: 10000 });
  expect((await getTestState(page)).lastTrade).toMatchObject({ fromPlayerId: 'red', toPlayerId: 'blue' });
  await expect(page.getByTestId('game-toast').filter({ hasText: 'Red traded with Blue (bot)' })).toBeVisible();
  await page.getByTestId('trade-done').click();

  // A bot proposes to the human, who sees Accept/Decline on their own screen.
  // Keep the human under the discard limit so a bot's 7 cannot pause the flow.
  const handBefore = (await getTestState(page)).resources.red;
  await page.evaluate((hand) => window.__CATAN_TEST_API.giveResources('red', Object.fromEntries(
    Object.entries(hand).map(([resource, amount]) => [resource, (resource === 'wood' ? 1 : 0) - amount]),
  )), handBefore);
  await page.evaluate(() => window.__CATAN_TEST_API.queueBotTradeOffer({ ore: 1 }, { wood: 1 }));
  await page.getByTestId('end-turn').click();
  await expect(page.getByTestId('incoming-trade')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('incoming-trade')).toContainText('Blue (bot) wants to trade');
  await page.getByTestId('reject-trade-red').click();
  await expect(page.getByTestId('incoming-trade')).toHaveCount(0);
  expect((await getTestState(page)).lastTrade).toMatchObject({ type: 'rejected', playerId: 'red', fromPlayerId: 'blue' });
  // The bot carries on with its turn after the answer.
  await expect.poll(async () => (await getTestState(page)).currentPlayerId, { timeout: 15000 }).not.toBe('blue');
});

test.describe('invite link join flow', () => {
  async function receive(page, type, payload, participantId = 'host-1') {
    await page.evaluate(({ type: messageType, payload: messagePayload, participantId: sender }) => {
      window.__CATAN_TEST_API.receiveMultiplayerMessage({ type: messageType, payload: messagePayload }, { participantId: sender });
    }, { type, payload, participantId });
  }

  async function outbound(page) {
    return page.evaluate(() => window.__CATAN_TEST_API.getOutboundMessages());
  }

  function hostLobby(claims, playerCount = 4) {
    const seats = [
      ['red', 'Red', '#c83c34'], ['blue', 'Blue', '#2f67b2'], ['white', 'White', '#f1efe7'], ['orange', 'Orange', '#e28b2d'],
    ].slice(0, playerCount).map(([playerId, label, color]) => ({
      playerId, label, color,
      claimedBy: claims[playerId]?.[0] ?? null,
      displayName: claims[playerId]?.[1] ?? '',
      connected: Boolean(claims[playerId]),
    }));
    return {
      room: { roomName: 'catan-table-e2e', hostParticipantId: 'host-1', status: 'lobby', playerCount },
      seats,
      spectators: [],
      version: Date.now(),
    };
  }

  test.beforeEach(async ({ page }) => {
    await page.goto('/?room=catan-table-e2e');
    await waitForTestApi(page);
  });

  test('an invited guest picks an open color and re-picks after losing a race', async ({ page }) => {
    await expect(page.getByTestId('lobby-join')).toContainText('Join the game');
    await expect(page.getByTestId('lobby-join').locator('select')).toHaveCount(0);

    await page.evaluate(() => window.__CATAN_TEST_API.simulateRoomConnection({ participantId: 'guest-1', displayName: 'Sam' }));
    await expect(page.getByTestId('lobby-waiting')).toBeVisible();
    expect((await outbound(page)).map((message) => message.type)).toContain('lobby:hello');
    // Connecting does not claim a seat: the guest has not joined the game yet.
    expect((await outbound(page)).some((message) => message.type === 'seat:claim')).toBe(false);

    await receive(page, 'lobby:state', { lobbyState: hostLobby({ red: ['host-1', 'Johnny'] }) });
    await expect(page.getByTestId('color-picker')).toBeVisible();
    await expect(page.getByTestId('pick-color-red')).toBeDisabled();
    await expect(page.getByTestId('pick-color-red')).toHaveAttribute('data-status', 'taken');
    await expect(page.getByTestId('pick-color-red')).toContainText('Johnny');
    await expect(page.getByTestId('pick-color-blue')).toBeEnabled();
    expect((await getTestState(page)).viewerId).toBeNull();

    await page.getByTestId('pick-color-blue').click();
    await expect.poll(async () => (await outbound(page)).filter((message) => message.type === 'seat:claim').map((message) => message.payload.playerId))
      .toEqual(['blue']);
    await expect(page.getByTestId('pick-color-orange')).toBeDisabled(); // waiting for the host's answer

    // The host gave Blue to someone whose claim arrived first.
    await receive(page, 'seat:claimResult', { to: 'guest-1', ok: false, playerId: 'blue', reason: 'taken', takenBy: 'Lee' });
    await receive(page, 'lobby:state', { lobbyState: hostLobby({ red: ['host-1', 'Johnny'], blue: ['guest-7', 'Lee'] }) });
    await expect(page.getByTestId('claim-notice')).toContainText('Blue was just taken by Lee. Pick another color.');
    await expect(page.getByTestId('pick-color-blue')).toBeDisabled();

    await page.getByTestId('pick-color-white').click();
    await receive(page, 'seat:claimResult', { to: 'guest-1', ok: true, playerId: 'white' });
    await receive(page, 'lobby:state', { lobbyState: hostLobby({ red: ['host-1', 'Johnny'], blue: ['guest-7', 'Lee'], white: ['guest-1', 'Sam'] }) });
    await expect(page.getByTestId('guest-lobby')).toContainText('You’re White');
    await expect(page.getByTestId('pick-color-white')).toHaveAttribute('data-status', 'mine');
    await expect(page.getByTestId('player-setup-helper')).toContainText('Waiting for the host to start (3/4 players)');
    await expect(page.getByTestId('claim-notice')).toHaveCount(0);
    expect((await getTestState(page)).viewerId).toBe('white');
  });

  test('a full lobby shows a clear screen instead of letting the guest in', async ({ page }) => {
    await page.evaluate(() => window.__CATAN_TEST_API.simulateRoomConnection({ participantId: 'guest-late', displayName: 'Late' }));
    await receive(page, 'lobby:state', {
      lobbyState: hostLobby({
        red: ['host-1', 'Johnny'], blue: ['guest-7', 'Lee'], white: ['guest-8', 'Ana'],
      }, 3),
    });
    await expect(page.getByTestId('lobby-full')).toBeVisible();
    await expect(page.getByTestId('lobby-full')).toContainText('Lobby is full');
    await expect(page.getByTestId('color-picker')).toHaveCount(0);
    const state = await getTestState(page);
    expect(state.lobbyFull).toBe(true);
    expect(state.viewerId).toBeNull();
    expect((await outbound(page)).some((message) => message.type === 'seat:claim')).toBe(false);
    await expect(page.getByTestId('lobby-full-new')).toHaveAttribute('href', '/');

    await page.getByTestId('lobby-full-retry').click();
    await expect(page.getByTestId('lobby-join')).toBeVisible();
    await expect(page.getByTestId('lobby-full')).toHaveCount(0);
  });
});

test('host shares an invite link and validates racing color claims', async ({ page }) => {
  await page.goto('/');
  await waitForTestApi(page);
  await page.evaluate(() => window.__CATAN_TEST_API.simulateRoomConnection({
    participantId: 'host-1', displayName: 'Johnny', isRoomCreator: true, roomName: 'catan-table-host',
  }));
  await expect(page.getByTestId('host-lobby')).toBeVisible();
  await expect(page.getByTestId('invite-url')).toHaveValue(/\?room=catan-table-host$/);
  await page.getByTestId('copy-invite-link').click();
  await expect(page.getByTestId('copy-invite-link')).toContainText('Copied!');
  await expect(page.getByTestId('pick-color-red')).toHaveAttribute('data-status', 'mine');
  await expect(page.getByTestId('start-game')).toBeDisabled();

  const claim = (participantId, playerId, displayName) => page.evaluate((args) => {
    window.__CATAN_TEST_API.receiveMultiplayerMessage(
      { type: 'seat:claim', payload: { playerId: args.playerId, participantId: args.participantId, displayName: args.displayName } },
      { participantId: args.participantId, displayName: args.displayName },
    );
  }, { participantId, playerId, displayName });

  // Two guests pick Blue at nearly the same time: the first claim to arrive wins.
  await claim('guest-a', 'blue', 'Ann');
  await expect.poll(async () => (await getTestState(page)).lobbyState.seats.find((seat) => seat.playerId === 'blue').claimedBy).toBe('guest-a');
  await claim('guest-b', 'blue', 'Bob');
  await expect.poll(async () => (await page.evaluate(() => window.__CATAN_TEST_API.getOutboundMessages()))
    .filter((message) => message.type === 'seat:claimResult').map((message) => message.payload))
    .toEqual([
      { to: 'guest-a', ok: true, playerId: 'blue' },
      { to: 'guest-b', ok: false, playerId: 'blue', reason: 'taken', takenBy: 'Ann' },
    ]);
  const seats = (await getTestState(page)).lobbyState.seats;
  expect(seats.find((seat) => seat.playerId === 'blue').claimedBy).toBe('guest-a');
  expect(seats.some((seat) => seat.claimedBy === 'guest-b')).toBe(false);
  await expect(page.getByTestId('pick-color-blue')).toHaveAttribute('data-status', 'taken');
  await expect(page.getByTestId('pick-color-blue')).toContainText('Ann');
});
