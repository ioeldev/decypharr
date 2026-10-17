// Run with: node --test scripts/test-repair-ui.cjs
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness(asset) {
    const elements = new Map();
    const element = () => ({innerHTML: '', textContent: '', children: [], classList: {add() {}, remove() {}}, appendChild(child) {this.children.push(child);}});
    const timers = [];
    const context = vm.createContext({window: {}, document: {
        getElementById(id) {if (!elements.has(id)) elements.set(id, element()); return elements.get(id);},
        createElement: element,
    }, console, Date, setTimeout(fn, delay) {timers.push(delay); return timers.length;}, clearTimeout() {}});
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'pkg/server/assets', asset, 'repair.js'), 'utf8'), context);
    const manager = vm.runInContext('Object.create(RepairManager.prototype)', context);
    manager.api = '/api';
    return {manager, elements, timers};
}

for (const asset of ['js', 'build/js']) {
    test(`${asset}: recovery remains visible after submission finishes`, async () => {
        const {manager, elements, timers} = harness(asset);
        manager.fetchJSON = async () => ({queued: 6, in_flight: 3, max_active: 10, total: 12,
            status_counts: {queued: 6, searching: 1, waiting_for_import: 1, needs_attention: 1, ready: 2, failed: 1}});
        await manager.loadRecoveryProgress();
        manager.scheduleStatusPoll({});
        assert.equal(timers.at(-1), 5000);
        assert.equal(elements.get('recoveryProgress').value, 2);
        assert.equal(elements.get('recoveryProgress').max, 12);
        assert.match(elements.get('recoveryProgressLabel').textContent, /2 of 12/);
        const tiles = elements.get('recoveryCountsGrid').children.map(e => e.innerHTML).join('');
        assert.match(tiles, /Queued.*6/);
        assert.match(tiles, /Imported.*2/);
        assert.match(tiles, /Failed.*1/);
        manager.fetchJSON = async () => {throw new Error('offline');};
        await manager.loadRecoveryProgress();
        assert.match(elements.get('recoveryQueueLine').textContent, /out of date/);
    });

    test(`${asset}: run history distinguishes queueing, restoration, and legacy counts`, () => {
        const {manager, elements} = harness(asset);
        manager.renderHistory([
            {status: 'completed', source: 'fix-broken:all', stats: {repaired: 4, queued: 3, restored: 1}},
            {status: 'completed', source: 'fix-broken:all', stats: {repaired: 1668}},
        ]);
        const rows = elements.get('runsTableBody').children;
        assert.match(rows[0].innerHTML, /Submission complete/);
        assert.match(rows[0].innerHTML, /<td>3<\/td>\s*<td>1<\/td>/);
        assert.doesNotMatch(rows[0].innerHTML, /legacy|Repaired/);
        assert.match(rows[1].innerHTML, /1668 recovery requested \(legacy\)/);
        assert.doesNotMatch(rows[1].innerHTML, /<td>1668<\/td>/);
    });
}
