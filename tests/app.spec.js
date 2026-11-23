import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('starts without runtime errors and switches between tabs', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.stack));

  await page.goto('/');
  expect(errors).toEqual([]);
  await expect(page.locator('#selectedCampaign option')).toHaveCount(1);
  await expect(page.locator('#tab-lib')).toHaveClass(/on/);

  await page.locator('#tabs [data-tab="combat"]').click();
  await expect(page.locator('#tab-combat')).toHaveClass(/on/);
  await expect(page.locator('#tab-lib')).not.toHaveClass(/on/);

  await page.locator('#tabs [data-tab="table"]').click();
  await expect(page.locator('#tab-table')).toHaveClass(/on/);
  expect(errors).toEqual([]);
});

test('applies damage to temporary HP first and undo restores combat state', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto('/');
  await expect(page.locator('#selectedCampaign option')).toHaveCount(1);
  await page.locator('#tabs [data-tab="combat"]').click();

  await page.locator('#btnAddPlayer').click();
  await page.locator('#playerCharacter').fill('Aranwe');
  await page.locator('#playerHp').fill('10');
  await page.locator('#playerMaxHp').fill('20');
  await page.locator('#playerTempHp').fill('2');
  await page.locator('#playerSave').click();
  expect(errors).toEqual([]);

  await expect(page.locator('#playerList')).toContainText('Aranwe');
  await page.locator('#btnAllToCombat').click();
  const combatant = page.locator('#initiativeList .ini').filter({ hasText: 'Aranwe' });
  await expect(combatant).toHaveCount(1);
  await combatant.click();

  await page.locator('#initiativeList .strip .apply input').fill('7');
  await page.locator('#initiativeList .strip .apply button').click();
  await expect(combatant.locator('.hp')).toHaveText('5/20');
  await expect(page.locator('#playerList')).toContainText('5/20');

  await page.locator('#btnUndoDamage').click();
  await expect(page.locator('#initiativeList .ini').filter({ hasText: 'Aranwe' }).locator('.hp'))
    .toHaveText('10/20 +2');
  await expect(page.locator('#playerList')).toContainText('10/20 +2');
  expect(errors).toEqual([]);
});

test('imports a map image into the scene library and displays it', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto('/');
  await expect(page.locator('#selectedCampaign option')).toHaveCount(1);
  await page.locator('#fileMap').setInputFiles({
    name: 'starter-map.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=',
      'base64'
    )
  });

  await expect(page.locator('#library button[title="starter-map.png"]')).toBeVisible();
  expect(errors).toEqual([]);
  await expect(page.locator('#brandInfo')).toContainText('starter-map');
  await expect(page.locator('#empty')).toHaveCSS('display', 'none');
  expect(errors).toEqual([]);
});

test('long rest restores a character and can be undone', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#selectedCampaign option')).toHaveCount(1);
  await page.locator('#tabs [data-tab="combat"]').click();

  await page.locator('#btnAddPlayer').click();
  await page.locator('#playerCharacter').fill('Mira');
  await page.locator('#playerHp').fill('8');
  await page.locator('#playerMaxHp').fill('12');
  await page.locator('#playerTempHp').fill('3');
  await page.locator('#playerSave').click();

  await page.locator('#btnLongRest').click();
  await page.locator('#dcAceptar').click();
  await expect(page.locator('#playerList')).toContainText('12/12');
  await expect(page.locator('#playerList')).not.toContainText('+3');

  await page.locator('#btnUndoLongRest').click();
  await expect(page.locator('#playerList')).toContainText('8/12 +3');
});

test('exports and imports a campaign backup without replacing the original', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto('/');
  await expect(page.locator('#selectedCampaign option')).toHaveCount(1);
  await page.locator('#fileMap').setInputFiles({
    name: 'backup-map.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=',
      'base64'
    )
  });
  await expect(page.locator('#brandInfo')).toContainText('backup-map');

  await page.locator('#tabs [data-tab="combat"]').click();
  await page.locator('#btnAddPlayer').click();
  await page.locator('#playerCharacter').fill('Neris');
  await page.locator('#playerSave').click();
  await expect(page.locator('#playerList')).toContainText('Neris');

  await page.locator('#tabs [data-tab="lib"]').click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#btnSave').click();
  const download = await downloadPromise;
  const backup = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(backup.campaign.players.map(player => player.character)).toContain('Neris');
  expect(backup.scenes).toHaveLength(1);

  await page.locator('#fileSes').setInputFiles({
    name: 'campaign-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup))
  });
  await expect(page.locator('#selectedCampaign option')).toHaveCount(2);
  await expect(page.locator('#selectedCampaign option:checked')).toHaveText(/imported/);
  await expect(page.locator('#library button[title="backup-map.png"]')).toHaveCount(1);
  await expect(page.locator('#playerList')).toContainText('Neris');
  expect(errors).toEqual([]);
});
