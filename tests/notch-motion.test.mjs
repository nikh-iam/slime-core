import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const urls = new Map();
function load(name) {
  if (urls.has(name)) return urls.get(name);
  let code = ts.transpileModule(readFileSync(new URL(`../src/notch/${name}.ts`, import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  code = code.replace(/from ['"]\.\/([^'"]+)['"]/g, (_, dependency) => `from '${load(dependency)}'`);
  const url = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`; urls.set(name, url); return url;
}
const { NotchMotionController, motionTargets, hostEnvelope } = await import(load('NotchMotionController'));
const { NotchMotionDriver } = await import(load('NotchMotionDriver'));
function settle(c) { for (let i = 0; i < 1200 && !c.settled; i++) c.step(1 / 60); assert.equal(c.settled, true, `Did not settle: ${c.state}`); }
function at(state) { const c = new NotchMotionController(); c.request(state); settle(c); return c; }
for (const from of Object.keys(motionTargets)) for (const to of Object.keys(motionTargets)) {
  test(`${from} -> ${to}: exact target, bounded deformation, center and top anchor`, () => {
    const c = at(from); c.request(to);
    for (let i = 0; i < 1200 && !c.settled; i++) {
      const f = c.step(1 / 60); assert.equal(f.anchorX, 0); assert.ok(f.stretchX >= 0.978 && f.stretchX <= 1.022);
      if (from !== 'HIDDEN' && to !== 'HIDDEN') assert.equal(f.offsetY, 0);
      const h = hostEnvelope(f); assert.ok(h.width >= f.width && h.height >= f.height);
      assert.ok(h.width - f.width <= 97 && h.height - f.height <= 50);
    }
    assert.equal(c.settled, true); assert.deepEqual(c.geometry, motionTargets[to]);
    assert.ok(Object.values(c.velocity).every((v) => v === 0));
  });
}
test('width leads height and content waits for physical space; collapse withdraws content first', () => {
  const c = at('COLLAPSED'); c.request('EXPANDED'); c.step(0.016);
  assert.ok((c.geometry.width - 90) / 330 > (c.geometry.height - 48) / 112);
  assert.equal(c.geometry.contentProgress, 0);
  settle(c); c.request('COLLAPSED'); const height = c.geometry.height; c.step(0.016);
  assert.equal(c.geometry.height, height); assert.ok(c.geometry.contentProgress < 1);
  settle(c);
});
test('retargeting preserves exact geometry and velocity in both directions', () => {
  const c = at('COLLAPSED');
  for (let i = 0; i < 200; i++) {
    const geometry = { ...c.geometry }, velocity = { ...c.velocity };
    c.request(i % 2 ? 'COLLAPSED' : 'EXPANDED');
    assert.deepEqual(c.geometry, geometry); assert.deepEqual(c.velocity, velocity);
    c.step(0.016);
  }
  c.request('COLLAPSED'); settle(c); assert.deepEqual(c.geometry, motionTargets.COLLAPSED);
});
test('hover/press perturbation returns exactly; changing reduced motion while settled removes perturbation', () => {
  const c = at('COLLAPSED'); c.interact(true, false); settle(c); assert.equal(c.geometry.width, 92);
  c.interact(true, true); settle(c); assert.equal(c.geometry.width, 89);
  c.request('COLLAPSED', true); settle(c); assert.deepEqual(c.geometry, motionTargets.COLLAPSED);
  c.request('EXPANDED', true); const first = c.step(0.016); assert.ok(first.width > 90 && first.width < 420); assert.equal(first.stretchX, 1);
  settle(c); c.interact(false, false); settle(c);
});
test('semantic events occur once; hover does not repeat settled; abandoned transitions never become ready', () => {
  const events = []; const c = new NotchMotionController((e, s) => events.push([e, s]));
  c.request('EXPANDED'); settle(c);
  assert.deepEqual(events.map(([e]) => e), ['onRevealStart', 'onContentReady', 'onSettled']);
  c.interact(true, false); settle(c); assert.equal(events.length, 3);
  events.length = 0; c.request('COLLAPSED'); settle(c);
  assert.deepEqual(events.map(([e]) => e), ['onCollapseStart', 'onSettled']);
  events.length = 0; c.request('EXPANDED'); c.step(0.016); c.request('HIDDEN'); settle(c);
  assert.ok(!events.some(([e]) => e === 'onContentReady'));
});
function harness(interval = 32) {
  let now = 0, id = 0; const raf = new Map(), pending = [], paints = [];
  const scheduler = { now: () => now, request: (f) => { raf.set(++id, f); return id; }, cancel: (i) => raf.delete(i) };
  const service = { motion: (bounds) => new Promise((resolve, reject) => pending.push({ bounds, resolve, reject })) };
  const d = new NotchMotionDriver(service, scheduler, (f) => paints.push(f), undefined, () => {}, interval);
  return { d, raf, pending, paints, async tick(ms = 16, ack = true) {
    now += ms; const callbacks = [...raf.values()]; raf.clear(); callbacks.forEach((f) => f(now));
    if (ack) { pending.splice(0).forEach((p) => p.resolve({ width: p.bounds.width, height: p.bounds.height })); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }
  } };
}
for (const interval of [16, 24, 32, 40]) test(`driver ${interval}ms: one IPC, tight final host, no resources after settle`, async () => {
  const h = harness(interval); h.d.request({ state: 'EXPANDED', revision: 1 }, false);
  for (let i = 0; i < 250; i++) { await h.tick(); assert.ok(h.raf.size <= 1); assert.ok(h.pending.length <= 1); }
  assert.equal(h.raf.size, 0); assert.equal(h.d.metrics.active, false);
  assert.deepEqual(h.d.metrics.acknowledged, { width: 420, height: 160 });
  h.d.request({ state: 'HIDDEN', revision: 2 }, false);
  for (let i = 0; i < 250; i++) await h.tick();
  assert.deepEqual(h.d.metrics.acknowledged, { width: 36, height: 1 }); assert.equal(h.raf.size, 0);
});
test('stale acknowledgement cannot overwrite geometry; disposal ignores late native completion', async () => {
  const h = harness(); h.d.request({ state: 'EXPANDED', revision: 1 }, false); await h.tick(16, false);
  const stale = h.pending.shift(); h.d.request({ state: 'COLLAPSED', revision: 2 }, false);
  stale.resolve({ width: 500, height: 250 }); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(h.d.metrics.acknowledged, { width: 36, height: 1 });
  await h.tick(40, false); const pending = h.pending.shift(); h.d.dispose(); const count = h.paints.length;
  pending?.resolve({ width: 500, height: 250 }); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.equal(h.raf.size, 0); assert.equal(h.paints.length, count);
});
test('pending shrink constrains painting during a rapid expansion reversal', async () => {
  const h = harness(); h.d.request({ state: 'EXPANDED', revision: 1 }, false);
  for (let i = 0; i < 180; i++) await h.tick();
  h.d.request({ state: 'COLLAPSED', revision: 2 }, false);
  for (let i = 0; i < 10; i++) await h.tick();
  await h.tick(40, false); const pending = h.pending[0];
  h.d.request({ state: 'EXPANDED', revision: 3 }, false);
  const start = h.paints.length;
  for (let i = 0; i < 10; i++) await h.tick(16, false);
  for (const f of h.paints.slice(start)) { assert.ok(f.width <= pending.bounds.width); assert.ok(f.height <= pending.bounds.height); }
  pending.resolve(pending.bounds); h.pending.shift(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  for (let i = 0; i < 180; i++) await h.tick();
  assert.equal(h.d.engine.settled, true); assert.equal(h.raf.size, 0);
});
test('backpressure freezes physical geometry and velocity, rather than advancing offscreen', async () => {
  const h = harness(); h.d.request({ state: 'EXPANDED', revision: 1 }, false);
  const geometry = { ...h.d.engine.geometry }, velocity = { ...h.d.engine.velocity };
  for (let i = 0; i < 30; i++) await h.tick(16, false);
  assert.deepEqual(h.d.engine.geometry, geometry); assert.deepEqual(h.d.engine.velocity, velocity);
  h.d.dispose();
});
test('driver stress converges after 300 target changes; failures cancel pending work', async () => {
  const h = harness(); const states = ['EXPANDED', 'COMPACT', 'HIDDEN', 'COLLAPSED'];
  for (let i = 0; i < 300; i++) { h.d.request({ state: states[i % 4], revision: i }, false); await h.tick(); }
  h.d.request({ state: 'COLLAPSED', revision: 300 }, false);
  for (let i = 0; i < 250; i++) await h.tick();
  assert.deepEqual(h.d.engine.geometry, motionTargets.COLLAPSED); assert.equal(h.raf.size, 0);
  h.d.request({ state: 'EXPANDED', revision: 301 }, false); await h.tick(40, false);
  h.pending.shift().reject(new Error('host unavailable')); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.equal(h.raf.size, 0); assert.equal(h.d.metrics.active, false);
});
