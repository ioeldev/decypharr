import { checkSettingsVisibility } from './settings-visibility.smoke.mjs';
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
    '/api/repair/health': [{ entry_name: 'broken-entry', display_name: 'Broken media file with a long name', failure_reason: 'Provider no longer has a readable copy', status: 'broken', last_checked_at: '2026-10-18T12:00:00Z' }],
    '/api/repair/runs': [{ id: 'run', started_at: '2026-10-18', status: 'completed', source: 'fix-broken:all', stats: { repaired: 1668 } }],
    '/api/arr/reacquire/queue': { paused: false, queued: 3, in_flight: 2, max_active: 10, searching: 1, search_workers: 3, total: 8, status_counts: { queued: 3, waiting_for_download: 1, waiting_for_import: 1, ready: 2, failed: 1 }, search_cooldowns: { shows: '2026-10-18T12:00:00Z' } },
    '/api/arr/reacquire/jobs': [{ id: 'job', status: 'needs_attention', arrName: 'shows', retryReason: 'no_download', createdAt: '2026-10-18', bindings: [{ arrName: 'shows', arrType: 'sonarr', seriesId: 9, episodeIds: [100], libraryPath: '/tv/Show/Season 1/Show.S01E01.mkv' }] }],
    '/api/arr/media/details': { title: 'Canonical Show', episodes: [{ id: 100, seasonNumber: 2, episodeNumber: 3 }] },
    '/api/arr/bindings': [], '/api/arr/index': [], '/api/arrs': [],
    '/api/repair/library': { findings: [{ health: { entry_name: 'incident', status: 'broken', display_name: 'Example file' }, job: null, file: { arr_name: 'shows', arr_fingerprint: 'a', arr_kind: 'sonarr', media_id: 9, season_number: 1, episode_id: 100, source_path: '/tv/Show/Season 1/file.mkv' }, label: 'Example file', category: 'pending', season: 1 }], total: 1, page: 1, limit: 50, maxRetries: 3 },
    '/debug/stats': { memory: { alloc: 123 }, mount: { type: 'dfs' }, debrids: [], usenet: { providers: [] }, access: { webdav: { enabled: true, path: '/webdav' } } },
  };
  for (const prefix of ['', '/base']) {
    fixtures['/api/arr/reacquire/jobs'][0].status = 'needs_attention';
    fixtures['/api/arr/reacquire/queue'].queued = 3;
    fixtures['/api/arr/reacquire/queue'].paused = false;
    configuration.download_folder = '/downloads';
    let delayConfiguration = false;
    let rejectHealthCheck = true;
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
        if (path === '/api/arr/reacquire/queue') Object.assign(fixtures[path], request.postDataJSON());
        if (path === '/api/repair/run' && rejectHealthCheck) {
          rejectHealthCheck = false;
          return route.fulfill({ status: 503, json: { error: 'Health check temporarily unavailable' } });
        }
        if (path === '/api/arr/reacquire/jobs/job/retry') {
          fixtures['/api/arr/reacquire/jobs'][0].status = 'queued';
          fixtures['/api/arr/reacquire/queue'].queued = 4;
        }
        return route.fulfill({ json: path === '/api/add' ? [{ status: 'success' }] : { success: true, message: 'Saved' } });
      }
      if (path === '/api/ui') return route.fulfill({ json: session });
      if (path === '/api/repair/library') {
        assert.equal(url.searchParams.get('limit'), '50');
        const pageNumber = Number(url.searchParams.get('page'));
        const search = url.searchParams.get('search');
        const fixture = fixtures[path];
        const findings = Array.from({ length: search ? 1 : 50 }, (_, index) => ({
          ...fixture.findings[0], label: search || `Example file ${pageNumber}-${index}`,
          health: { ...fixture.findings[0].health, entry_name: `incident-${pageNumber}-${index}` },
          file: index === 49 ? { ...fixture.findings[0].file, arr_name: 'movies', arr_kind: 'radarr', media_id: 10 } : fixture.findings[0].file,
        }));
        return route.fulfill({ json: { ...fixture, findings, page: pageNumber, total: search ? 1 : 10000 } });
      }
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
      for (const theme of ['dark', 'light']) {
        await page.evaluate((theme) => { document.documentElement.dataset.theme = theme; }, theme);
        for (const width of [320, 375, 768, 1440]) {
          await page.setViewportSize({ width, height: 1000 });
          await page.waitForTimeout(30);
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${path}: horizontal overflow at ${width}px in ${theme} theme`);
        }
      }
      await page.screenshot({ path: `/tmp/decypharr-ui-${prefix ? 'base-' : ''}${path.replaceAll('/', '-') || 'dashboard'}.png`, fullPage: true });
      if (path === '/') {
        const queueFixture = fixtures['/api/torrents'];
        queueFixture.torrents = [{ info_hash: 'test-hash', name: 'A long media title '.repeat(12), size: 1073741824, progress: 0.42, protocol: 'torrent', state: 'downloading', category: 'movies', active_provider: 'realdebrid' }];
        queueFixture.total = 1;
        await page.getByRole('button', { name: 'Refresh', exact: true }).click();
        const progress = page.getByRole('progressbar');
        await progress.waitFor();
        assert.equal(await progress.getAttribute('aria-valuenow'), '42');
        await page.getByRole('checkbox', { name: 'Select all visible entries', exact: true }).check();
        await page.getByRole('button', { name: 'Delete Selected (1)', exact: true }).waitFor();
        const rowMenu = page.getByRole('button', { name: /^Actions for A long media title/ });
        await rowMenu.click();
        await page.getByRole('menuitem', { name: 'Copy Name', exact: true }).waitFor();
        await page.getByRole('menuitem', { name: 'Remove From Provider', exact: true }).waitFor();
        await page.keyboard.press('Escape');
        assert.equal(await rowMenu.evaluate(button => document.activeElement === button), true);
        assert.equal(await page.getByRole('menu').count(), 0);
        await page.setViewportSize({ width: 375, height: 812 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'populated queue: mobile overflow');
        await page.setViewportSize({ width: 1440, height: 1000 });
        queueFixture.torrents = [];
        queueFixture.total = 0;
      }
      if (path === '/browse') {
        const listingFixture = fixtures['/api/browse/'];
        listingFixture.entries = [{ name: 'A media file '.repeat(15), path: '/media/file.mkv', size: 1073741824, mod_time: '2026-10-18', is_dir: false, can_delete: true, info_hash: 'browse-test' }];
        listingFixture.total = 1;
        await page.getByRole('button', { name: 'Refresh', exact: true }).click();
        const fileActions = page.getByRole('button', { name: /^Actions for A media file/ });
        await fileActions.click();
        await page.getByRole('menuitem', { name: 'Download file', exact: true }).waitFor();
        await page.getByRole('menuitem', { name: 'Delete', exact: true }).waitFor();
        await page.keyboard.press('Escape');
        listingFixture.entries = [];
        listingFixture.total = 0;
      }
      if (path === '/repair') {
        assert.equal(await page.locator('form [name=protocol]').count(), 0, 'health check form stays off the page');
        await page.getByRole('button', { name: 'Run a health check', exact: true }).click();
        const healthCheck = page.getByRole('dialog', { name: 'Run a health check' });
        await healthCheck.getByLabel('Protocol', { exact: true }).selectOption('nzb');
        await healthCheck.getByLabel('Automatically repair', { exact: true }).check();
        await page.screenshot({ path: `/tmp/decypharr-health-check-${prefix ? 'base' : 'root'}.png` });
        await healthCheck.getByRole('button', { name: 'Start health check', exact: true }).click();
        await healthCheck.getByRole('alert').filter({ hasText: 'Health check temporarily unavailable' }).waitFor();
        assert.equal(await healthCheck.getByLabel('Protocol', { exact: true }).inputValue(), 'nzb');
        await healthCheck.getByRole('button', { name: 'Start health check', exact: true }).click();
        await healthCheck.waitFor({ state: 'hidden' });
        const startRequest = mutations.filter(mutation => mutation.path === '/api/repair/run').at(-1);
        assert.equal(JSON.parse(startRequest.body).protocol, 'nzb');
        assert.equal(JSON.parse(startRequest.body).auto_repair, true);
        assert.equal(await page.getByRole('heading', { name: 'Run History', exact: true }).count(), 0);
        assert.equal(await page.getByRole('progressbar', { name: 'Imported recovery jobs' }).getAttribute('aria-valuenow'), '25');
        await page.getByRole('button', { name: 'Pause', exact: true }).click();
        await page.getByText('New starts paused', { exact: true }).waitFor();
        await page.getByText('2 recoveries in progress.', { exact: false }).waitFor();
        await page.getByRole('button', { name: 'Resume', exact: true }).click();
        await page.getByText('Recovering', { exact: true }).waitFor();
        await page.getByRole('button', { name: 'Actions for Broken media file with a long name', exact: true }).click();
        await page.getByRole('menuitem', { name: 'Recheck', exact: true }).click();
        await page.getByText('Recheck requested.', { exact: true }).waitFor();
        await page.getByRole('tab', { name: 'Run history', exact: true }).click();
        await page.locator('article [data-slot=badge]').filter({ hasText: 'Submission complete' }).waitFor();
        await page.getByRole('button', { name: 'Details for run run', exact: true }).click();
        await page.getByText('Technical details', { exact: true }).waitFor();
        await page.getByRole('button', { name: 'Details for run run', exact: true }).click();
      }
      if (path === '/repair/library') {
        await page.getByText('10000 findings · up to 50 per page', { exact: true }).waitFor();
        assert.equal(await page.locator('article').count(), 50);
        assert.equal(await page.locator('summary').filter({ hasText: 'Season 1' }).count(), 0, 'episodes are visible without expanding a season');
        const movie = page.getByRole('region', { name: 'Example file 1-49', exact: true });
        await movie.getByRole('button', { name: 'Details for Example file 1-49', exact: true }).click();
        await movie.getByText('Technical details', { exact: true }).waitFor();
        await movie.getByRole('button', { name: 'Details for Example file 1-49', exact: true }).click();
        const finding = page.locator('article').first();
        const detailsButton = finding.getByRole('button', { name: /^Details for/ });
        assert.equal(await detailsButton.getAttribute('aria-expanded'), 'false');
        await detailsButton.click();
        await finding.getByText('Technical details', { exact: true }).waitFor();
        for (const width of [320, 375, 768, 1440]) {
          await page.setViewportSize({ width, height: 1000 });
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `expanded finding: overflow at ${width}px`);
        }
        assert.equal(await finding.locator('dl dl').count(), 0, 'technical records stay unmounted until requested');
        await finding.getByRole('button', { name: /^Actions for/ }).click();
        await page.getByRole('menuitem', { name: 'Recheck', exact: true }).click();
        await finding.getByText('Action requested.', { exact: true }).waitFor();
        await detailsButton.click();
        assert.ok((await page.locator('article').nth(1).boundingBox()).height < 80, 'collapsed findings stay compact');
        await page.screenshot({ path: `/tmp/decypharr-finding-rows-${prefix ? 'base' : 'root'}.png`, fullPage: true });
        const nextPage = page.waitForRequest(request => request.url().includes('/api/repair/library?') && new URL(request.url()).searchParams.get('page') === '2');
        await page.getByRole('button', { name: 'Next', exact: true }).click();
        await nextPage;
        await page.getByText('Example file 2-0', { exact: true }).waitFor({ state: 'attached' });
        const searchRequest = page.waitForRequest(request => request.url().includes('/api/repair/library?') && new URL(request.url()).searchParams.get('search') === 'A distant finding');
        await page.getByLabel('Search findings', { exact: true }).fill('A distant finding');
        const searched = await searchRequest;
        assert.equal(new URL(searched.url()).searchParams.get('page'), '1');
        await page.getByText('A distant finding', { exact: true }).waitFor({ state: 'attached' });
        assert.equal(await page.locator('article').count(), 1);
      }
      if (path === '/repair/reacquire') {
        await page.getByRole('link', { name: 'Canonical Show · S02E03' }).waitFor();
        const jobDetails = page.getByRole('button', { name: 'Details for job job', exact: true });
        assert.equal(await jobDetails.getAttribute('aria-expanded'), 'false');
        await jobDetails.click();
        await page.getByText('Technical details', { exact: true }).waitFor();
        await page.setViewportSize({ width: 320, height: 812 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'expanded recovery: mobile overflow');
        await jobDetails.click();
        await page.screenshot({ path: `/tmp/decypharr-recovery-mobile-${prefix ? 'base' : 'root'}.png`, fullPage: true });
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.getByRole('button', { name: 'Actions for job job', exact: true }).click();
        await page.getByRole('menuitem', { name: 'Retry Now', exact: true }).click();
        await page.locator('article [data-slot=badge]').filter({ hasText: /^queued$/ }).waitFor({ timeout: 2000 });
        await page.getByLabel('Recovery stages').locator('div').filter({ has: page.getByText('Queued', { exact: true }) }).getByText('4', { exact: true }).waitFor({ timeout: 2000 });
      }
    }
    await page.setViewportSize({ width: 375, height: 812 });
    await page.getByRole('button', { name: 'Toggle Sidebar', exact: true }).click();
    const mobileSidebar = page.getByRole('dialog');
    await mobileSidebar.getByRole('link', { name: 'Download', exact: true }).click();
    await mobileSidebar.waitFor({ state: 'hidden' });
    await page.getByRole('heading', { name: 'Add Downloads' }).waitFor();
    await page.screenshot({ path: `/tmp/decypharr-mobile-${prefix ? 'base' : 'root'}.png`, fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    const previousTheme = await page.evaluate(() => document.documentElement.dataset.theme);
    await page.getByRole('button', { name: /^(Light|Dark) theme$/ }).click();
    assert.notEqual(await page.evaluate(() => document.documentElement.dataset.theme), previousTheme);
    await page.reload();
    assert.notEqual(await page.evaluate(() => document.documentElement.dataset.theme), previousTheme);
    await page.getByRole('heading', { name: 'Add Downloads' }).waitFor();
    // Client-side navigation keeps the document and basename.
    await page.evaluate(() => { window.smokeMarker = true; });
    await page.getByRole('link', { name: 'Download', exact: true }).click();
    await page.getByRole('heading', { name: 'Add Downloads' }).waitFor();
    assert.equal(await page.evaluate(() => window.smokeMarker), true);
    await page.locator('textarea[name="urls"]').fill('magnet:?xt=urn:btih:test');
    await page.getByLabel('Skip Multi-Season Checker', { exact: true }).check();
    assert.equal(await page.locator('form').evaluate(form => new FormData(form).has('skipMultiSeason')), true);
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
    await checkSettingsVisibility(page, mutations);
    await page.setViewportSize({ width: 375, height: 812 });
    const settingsTabs = page.getByRole('tab');
    for (const tab of await settingsTabs.all()) {
      await tab.click();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `settings ${await tab.textContent()}: mobile overflow`);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
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
    await page.setViewportSize({ width: 375, height: 812 });
    await page.getByLabel('Authentication mode', { exact: true }).selectOption('token');
    for (let step = 0; step < 5; step++) {
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `setup step ${step}: mobile overflow`);
      if (step === 1) await page.getByLabel('API key', { exact: true }).fill('test-key');
      if (step === 3) await page.getByLabel('Download folder', { exact: true }).fill('/downloads');
      if (step === 4) await page.getByLabel('Mount system', { exact: true }).selectOption('none');
      await page.getByRole('button', { name: 'Next', exact: true }).click();
    }
    await page.getByRole('heading', { name: 'Review', exact: true }).waitFor();
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log('PASS: all 11 routes, both themes, 320/375/768/1440px layouts, mobile drawer, persisted theme, all settings sections, setup steps, populated queue selection/progress, row action menus and keyboard focus, lazy repair details, root/prefix deployments, submissions and redirects; no browser errors.');
} finally {
  await browser.close();
  server.stop(true);
}
