import { expect, test } from '@playwright/test';

const viewports = [
  { name: 'desktop', size: { width: 1280, height: 900 } },
  { name: 'mobile', size: { width: 390, height: 844 } },
];

async function state(page) {
  return page.evaluate(() => window.__CATAN_TEST_API.getState());
}

async function enableLocalTestMode(page) {
  await page.getByTestId('enable-local-test-mode').click();
  await expect.poll(async () => (await state(page)).localTestMode).toBe(true);
}

async function completeSetup(page) {
  for (let step = 0; step < 6; step += 1) {
    await expect.poll(async () => (await state(page)).phase).toBe('setup');
    const before = await state(page);
    if (before.setupSettlementId == null) {
      await page.evaluate((id) => window.__CATAN_TEST_API.placeSettlement(id), before.settlementOptions[0]);
    }
    await expect.poll(async () => (await state(page)).setupSettlementId).not.toBeNull();
    const road = await state(page);
    await page.evaluate((id) => window.__CATAN_TEST_API.placeRoad(id), road.roadOptions[0]);
    if (step < 5) {
      await expect.poll(async () => (await state(page)).interactionMode).toBe('placeSettlement');
    }
  }
  await expect.poll(async () => (await state(page)).phase).toBe('roll');
}

for (const viewport of viewports) {
  test(`${viewport.name} supports an accessible deterministic game lifecycle`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(viewport.size);
    await page.goto('/');
    await page.waitForFunction(() => Boolean(window.__CATAN_TEST_API?.getState));
    await enableLocalTestMode(page);

    await expect(page.getByTestId('rules-help')).toHaveCount(0);

    const tools = page.getByTestId('development-test-controls');
    await tools.locator('summary').click();
    await tools.getByLabel('Board seed').fill('24680');
    await tools.getByRole('button', { name: 'Load deterministic board' }).click();
    await expect.poll(async () => (await state(page)).boardSeed).toBe(24680);

    await page.getByTestId('player-count').selectOption('3');
    await page.getByTestId('set-players').click();
    await page.getByTestId('start-game').click();
    await completeSetup(page);

    await tools.getByLabel('Die one').fill('2');
    await tools.getByLabel('Die two').fill('3');
    await tools.getByRole('button', { name: 'Roll chosen dice' }).click();
    await expect.poll(async () => (await state(page)).phase).toBe('action');
    expect((await state(page)).dice).toEqual([2, 3]);

    await page.evaluate(() => window.__CATAN_TEST_API.prepareVictory('red'));
    await page.getByTestId('end-turn').click();
    await expect(page.getByTestId('game-over')).toContainText('Red wins!');

    const buttons = await page.locator('button:visible').evaluateAll((items) => items.map((item) => item.getBoundingClientRect().height));
    expect(Math.min(...buttons)).toBeGreaterThanOrEqual(36);
  });
}
