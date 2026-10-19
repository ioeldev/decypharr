import assert from 'node:assert/strict';

export async function checkSettingsVisibility(page, mutations) {
  const advanced = page.getByRole('checkbox', { name: 'Show advanced settings', exact: true });
  assert.equal(await advanced.isChecked(), false);
  assert.equal(await page.getByLabel('Bind Address', { exact: true }).count(), 0);
  await advanced.check();
  await page.getByLabel('Bind Address', { exact: true }).fill('127.0.0.2');
  await advanced.uncheck();
  await page.getByRole('button', { name: 'Save Configuration', exact: true }).click();
  await page.getByText('Configuration saved.', { exact: true }).waitFor();
  assert.equal(JSON.parse(mutations.at(-1).body).bind_address, '127.0.0.2');

  await page.getByRole('tab', { name: 'Mount', exact: true }).click();
  await page.getByLabel('Type', { exact: true }).selectOption('rclone');
  assert.equal(await page.getByLabel('Vfs Cache Mode', { exact: true }).count(), 1);
  assert.equal(await page.getByLabel('Disk Cache Size', { exact: true }).count(), 0);
  await page.getByLabel('Type', { exact: true }).selectOption('none');
  assert.equal(await page.getByLabel('Cache Dir', { exact: true }).count(), 0);
  await page.getByLabel('Type', { exact: true }).selectOption('dfs');
  assert.equal(await page.getByLabel('Disk Cache Size', { exact: true }).count(), 1);

  await page.getByRole('tab', { name: 'STRM', exact: true }).click();
  const enabled = page.getByRole('checkbox', { name: 'Enabled', exact: true });
  await enabled.uncheck();
  assert.equal(await page.getByLabel('Path', { exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Regenerate STRM Files' }).count(), 0);
  await enabled.check();
  await page.getByLabel('Path', { exact: true }).fill('/preserved-strm');
  await enabled.uncheck();
  await page.getByRole('button', { name: 'Save Configuration', exact: true }).click();
  await page.getByText('Configuration saved.', { exact: true }).waitFor();
  const saved = JSON.parse(mutations.at(-1).body);
  assert.equal(saved.strm.enabled, false);
  assert.equal(saved.strm.path, '/preserved-strm');
  await enabled.check();
  assert.equal(await page.getByLabel('Path', { exact: true }).inputValue(), '/preserved-strm');
  await page.getByRole('button', { name: 'Reset Changes', exact: true }).click();

  await page.getByRole('tab', { name: 'Usenet', exact: true }).click();
  await advanced.check();
  assert.equal(await page.getByLabel('Socket Read Buffer', { exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Add Providers', exact: true }).click();
  assert.equal(await page.getByLabel('Socket Read Buffer', { exact: true }).count(), 1);
  await page.getByRole('button', { name: 'Reset Changes', exact: true }).click();
  await advanced.uncheck();
}
