import { test, expect } from '@playwright/test';

test.beforeEach(async ({ request }) => { await request.post('/api/reset'); });

test('first screen matches reference layout', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('.cover')).toHaveCount(10);
  await expect(page.locator('.cover.selected')).toHaveAttribute('data-id', 'plague');
  await expect(page.locator('#tabs button.active')).toHaveText('Favorites');
  await expect(page.locator('#hintInstall')).toHaveText('Установить');
  await expect(page.locator('#gameLogo')).toBeVisible();
  const bg = await page.locator('.bg.show').first().evaluate(el => el.style.backgroundImage);
  expect(bg).toContain('plague-bg');
  expect(errors).toEqual([]);
});

test('navigation changes background and selection', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.cover.selected')).toHaveAttribute('data-id', 'afterfall');
  await page.waitForTimeout(400);
  const bg = await page.locator('.bg.show').first().evaluate(el => el.style.backgroundImage);
  expect(bg).toContain('afterfall');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.cover.selected')).toHaveAttribute('data-id', 'plague');
});

test('install -> launch -> stop loop', async ({ page }) => {
  await page.goto('/');
  await page.click('.hint[data-action="install"]');
  await expect(page.locator('#hintInstall')).toHaveText('Играть', { timeout: 5000 });
  await page.click('.hint[data-action="install"]');
  await expect(page.locator('#sessionOverlay')).toBeVisible();
  await expect(page.locator('#runningPill')).toBeVisible({ timeout: 6000 });
  await page.click('#runningStop');
  await expect(page.locator('#runningPill')).toBeHidden();
  await expect(page.locator('.toast').last()).toContainText('Сессия завершена');
});

test('search, filter, details, favorite', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('f');
  await page.fill('#searchInput', 'alien');
  await expect(page.locator('.search-item')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(page.locator('#detailsDrawer')).toBeVisible();
  await expect(page.locator('#detailsTitle')).toHaveText('Alien: Isolation');
  await page.click('#detailsFav');
  await expect(page.locator('#detailsFav span')).toHaveText('В избранное');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Tab');
  await expect(page.locator('#filterDrawer')).toBeVisible();
  await page.selectOption('#fSource', 'steam');
  await page.selectOption('#fInstalled', 'not');
  await expect(page.locator('.cover')).toHaveCount(1);
});

test('library CRUD + undo', async ({ page }) => {
  await page.goto('/');
  await page.click('#btnLibrary');
  await expect(page.locator('#libraryManager')).toBeVisible();
  await page.click('#lmAdd');
  await page.fill('#gName', 'My Manual Game');
  await page.fill('#gExe', 'C:\\Games\\My\\game.exe');
  await page.click('#gameForm button[type="submit"]');
  await expect(page.locator('.lm-card', { hasText: 'My Manual Game' })).toHaveCount(1);
  await page.locator('.lm-card', { hasText: 'My Manual Game' }).dispatchEvent('contextmenu', { clientX: 500, clientY: 400, bubbles: true });
  await page.click('#ctxMenu button[data-c="delete"]');
  await page.click('#confirmYes');
  await expect(page.locator('.lm-card', { hasText: 'My Manual Game' })).toHaveCount(0);
  await page.click('.toast button');
  await expect(page.locator('.lm-card', { hasText: 'My Manual Game' })).toHaveCount(1);
});

test('mobile layout has no overflow and touch actions', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#touchActions')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.click('#touchActions button[data-action="details"]');
  await expect(page.locator('#detailsDrawer')).toBeVisible();
});
