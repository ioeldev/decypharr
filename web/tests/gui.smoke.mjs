import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const server = Bun.serve({ port: 0, hostname: '127.0.0.1', async fetch(request) {
  const url = new URL(request.url);
  const prefix = url.pathname.startsWith('/base/') ? '/base/' : '/';
  const relative = url.pathname.slice(prefix.length);
  const root = new URL('../dist/', import.meta.url);
  if (relative.startsWith('gui-assets/') || relative.startsWith('images/')) return new Response(Bun.file(new URL(relative, root)));
  const html = (await Bun.file(new URL('index.html', root)).text()).replace('<base href="/" />', `<base href="${prefix}" />`);
  return new Response(html, { headers: { 'Content-Type': 'text/html' } });
} });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH });
try {
  const errors = [];
  const mutations = [];
  const configuration = { download_folder: '/downloads', debrids: [{ name: 'realdebrid', api_key: 'test-key', download_api_keys: [] }], arrs: [], use_auth: false, mount: { type: 'dfs' }, repair: { enabled: true }, usenet: { providers: [] }, virtual_folders: [], api_token: 'test-token' };
  const fixtures = {
    '/version': { version: 'test', channel: 'dev' },
    '/api/torrents': { torrents: [], categories: [], total: 0, total_pages: 1 },
    '/api/config': configuration,
    '/api/browse/': { entries: [], total: 0, total_pages: 1 },
    '/api/repair/config': { enabled: true },
    '/api/repair/status': { enabled: true, health_counts: {}, next_run_at: '' },
    '/api/repair/health': [],
    '/api/repair/runs': [{ id: 'run', started_at: '2026-10-18', status: 'completed', source: 'fix-broken:all', stats: { repaired: 1668 } }],
    '/api/arr/reacquire/queue': { paused: false, queued: 3, in_flight: 2, max_active: 10, searching: 1, search_workers: 3, total: 7, status_counts: { ready: 2, failed: 1 }, search_cooldowns: { shows: '2026-10-18T12:00:00Z' } },
    '/api/arr/reacquire/jobs': [{ id: 'job', status: 'needs_attention', arrName: 'shows', retryReason: 'no_download', createdAt: '2026-10-18', bindings: [{ arrName: 'shows', arrType: 'sonarr', seriesId: 9, episodeIds: [100], libraryPath: '/tv/Show/Season 1/Show.S01E01.mkv' }] }],
    '/api/arr/media/details': { title: 'Canonical Show', episodes: [{ id: 100, seasonNumber: 2, episodeNumber: 3 }] },
    '/api/arr/bindings': [], '/api/arr/index': [], '/api/arrs': [],
    '/api/repair/library': { incidents: [{ entry_name: 'incident', status: 'broken', display_name: 'Example file', library_file: { arr_name: 'shows', arr_fingerprint: 'a', arr_kind: 'sonarr', media_id: 9, season_number: 1, episode_id: 100, source_path: '/tv/Show/Season 1/file.mkv' } }], jobs: [], maxRetries: 3 },
    '/debug/stats': { memory: { alloc: 123 }, mount: { type: 'dfs' }, debrids: [], usenet: { providers: [] }, access: { webdav: { enabled: true, path: '/webdav' } } },
  };
  for (const prefix of ['', '/base']) {
    fixtures['/api/arr/reacquire/jobs'][0].status = 'needs_attention';
    fixtures['/api/arr/reacquire/queue'].queued = 3;
    configuration.download_folder = '/downloads';
    let delayConfiguration = false;
    let releaseConfiguration;
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(5000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    let session = { authenticated: true, needs_registration: false, setup_required: false, token_only: false };
    await page.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname.slice(prefix.length);
      if (!path.startsWith('/api/') && !['/version', '/debug/stats'].includes(path)) return route.continue();
      assert.ok(url.pathname.startsWith(`${prefix}/`), 'API prefix');
      if (request.method() !== 'GET') {
        mutations.push({ path, body: request.postData(), method: request.method() });
        if (path === '/api/config') Object.assign(configuration, request.postDataJSON());
        if (path === '/api/arr/reacquire/jobs/job/retry') {
          fixtures['/api/arr/reacquire/jobs'][0].status = 'queued';
          fixtures['/api/arr/reacquire/queue'].queued = 4;
        }
        return route.fulfill({ json: path === '/api/add' ? [{ status: 'success' }] : { success: true, message: 'Saved' } });
      }
      if (path === '/api/ui') return route.fulfill({ json: session });
      if (path === '/api/config' && delayConfiguration) {
        delayConfiguration = false;
        await new Promise(resolve => { releaseConfiguration = resolve; });
      }
      assert.ok(path in fixtures, `Unmocked endpoint ${path}`);
      return route.fulfill({ json: fixtures[path] });
    });
    for (const [path, title] of [['/', 'Queues'], ['/download', 'Add Downloads'], ['/browse', 'Browse Library'], ['/repair', 'Repair'], ['/repair/library', 'Library Findings'], ['/repair/reacquire', 'Recovery Jobs'], ['/settings', 'Settings'], ['/stats', 'Statistics']]) {
      await page.goto(`http://127.0.0.1:${server.port}${prefix}${path}`);
      await page.getByRole('heading', { name: title, exact: true }).waitFor();
      await page.waitForTimeout(150);
      assert.equal(await page.getByRole('alert').count(), 0, `${path}: ${await page.getByRole('alert').allTextContents()}`);
      if (path === '/repair') await page.locator('summary').filter({ hasText: 'Submission complete' }).waitFor();
      if (path === '/repair/reacquire') {
        await page.getByRole('link', { name: 'Canonical Show · S02E03' }).waitFor();
        await page.getByRole('button', { name: 'Retry Now', exact: true }).click();
        await page.locator('article .badge').filter({ hasText: /^queued$/ }).waitFor({ timeout: 2000 });
        await page.getByText('4 queued.', { exact: false }).waitFor({ timeout: 2000 });
      }
    }
    // Client-side navigation keeps the document and basename.
    await page.evaluate(() => { window.smokeMarker = true; });
    await page.getByRole('link', { name: 'Download', exact: true }).click();
    await page.getByRole('heading', { name: 'Add Downloads' }).waitFor();
    assert.equal(await page.evaluate(() => window.smokeMarker), true);
    await page.locator('textarea[name="urls"]').fill('magnet:?xt=urn:btih:test');
    await page.getByRole('button', { name: 'Add to Download Queue' }).click();
    await page.getByText('Added 1 item(s)').waitFor();
    assert.equal(await page.locator('textarea[name="urls"]').inputValue(), '');
    delayConfiguration = true;
    configuration.download_folder = '/updated-by-server';
    const configurationRequest = page.waitForRequest(request => request.url().endsWith('/api/config'));
    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await configurationRequest;
    await page.getByLabel('Download Folder', { exact: true }).fill('/unsaved-draft');
    assert.equal(typeof releaseConfiguration, 'function');
    const refreshedConfiguration = page.waitForResponse(response => response.url().endsWith('/api/config'));
    releaseConfiguration();
    await refreshedConfiguration;
    assert.equal(await page.getByLabel('Download Folder', { exact: true }).inputValue(), '/unsaved-draft');
    await page.getByRole('button', { name: 'Save Configuration', exact: true }).click();
    await page.getByText('Configuration saved.', { exact: true }).waitFor();
    const saved = JSON.parse(mutations.at(-1).body);
    assert.equal(saved.api_token, undefined);
    assert.equal(saved.download_folder, '/unsaved-draft');
    session = { ...session, authenticated: false };
    await page.goto(`http://127.0.0.1:${server.port}${prefix}/repair`);
    await page.getByRole('heading', { name: 'Login', exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, `${prefix}/login`);
    session = { ...session, needs_registration: true };
    await page.goto(`http://127.0.0.1:${server.port}${prefix}/`);
    await page.getByRole('heading', { name: 'Create Account' }).waitFor();
    session = { ...session, setup_required: true };
    await page.goto(`http://127.0.0.1:${server.port}${prefix}/`);
    await page.getByRole('heading', { name: 'Setup Wizard' }).waitFor();
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log('PASS: all 11 routes, root/prefix deployments, client navigation, download and settings submissions, mutation refreshes, unsaved drafts, authentication/setup redirects; no browser errors.');
} finally {
  await browser.close();
  server.stop(true);
}
