/**
 * 3D canvas smoke: board paints something non-blank on desktop + mobile.
 *
 * Run:  npm run test:render
 * Or:   npx playwright test tests/three-render.spec.js
 * See tests/README.md
 */
import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';

const viewports = [
  { name: 'desktop', size: { width: 1280, height: 900 } },
  { name: 'mobile', size: { width: 390, height: 844 } },
];

for (const viewport of viewports) {
  test(`3D board renders a nonblank ${viewport.name} canvas`, async ({ page }) => {
    await page.setViewportSize(viewport.size);
    await page.goto('/');

    const scene = page.locator('.catan-scene');
    const canvas = scene.locator('canvas');

    await expect(scene).toBeVisible();
    await expect(canvas).toBeVisible();
    await page.waitForFunction(() => window.__CATAN_RENDER_READY === true);
    const sceneStats = await page.evaluate(() => window.__CATAN_SCENE_STATS);
    expect(sceneStats.hexes).toBe(19);
    expect(sceneStats.numberTokens).toBe(18);
    expect(sceneStats.ports).toBe(9);
    expect(sceneStats.robberTileId).toBeTruthy();

    const screenshot = await scene.screenshot({ path: `test-results/catan-3d-${viewport.name}.png` });
    const image = PNG.sync.read(screenshot);
    const colors = new Set();

    for (let index = 0; index < image.data.length; index += 16) {
      const red = image.data[index];
      const green = image.data[index + 1];
      const blue = image.data[index + 2];
      const alpha = image.data[index + 3];

      if (alpha > 0) {
        colors.add(`${red >> 4}-${green >> 4}-${blue >> 4}`);
      }
    }

    expect(image.width).toBeGreaterThan(250);
    expect(image.height).toBeGreaterThan(250);
    expect(colors.size).toBeGreaterThan(8);
  });
}

test('board and camera updates preserve the WebGL renderer', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.waitForFunction(() => window.__CATAN_RENDER_READY === true);
  await page.waitForFunction(() => Boolean(window.__CATAN_TEST_API?.getState));

  const initial = await page.evaluate(() => ({
    renderId: window.__CATAN_SCENE_STATS.renderId,
    boardSeed: window.__CATAN_TEST_API.getState().boardSeed,
  }));
  const nextBoardSeed = initial.boardSeed === 24680 ? 24681 : 24680;

  const testControls = page.getByTestId('development-test-controls');
  await testControls.locator('summary').click();
  await testControls.getByLabel('Board seed').fill(String(nextBoardSeed));
  await testControls.getByRole('button', { name: 'Load deterministic board' }).click();

  await expect.poll(
    () => page.evaluate(() => window.__CATAN_TEST_API.getState().boardSeed),
  ).toBe(nextBoardSeed);
  await expect.poll(
    () => page.evaluate(() => window.__CATAN_SCENE_STATS.renderId),
  ).toBe(initial.renderId);
  expect(initial.boardSeed).not.toBe(nextBoardSeed);

  await page.getByTestId('reset-camera').click();
  await expect.poll(
    () => page.evaluate(() => window.__CATAN_SCENE_STATS.renderId),
  ).toBe(initial.renderId);
  await expect(page.locator('.catan-scene canvas')).toHaveCount(1);
});
