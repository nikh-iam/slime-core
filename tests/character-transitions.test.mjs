import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import ts from 'typescript';
const urls = new Map();
function load(name) {
  if (urls.has(name)) return urls.get(name);
  const source = readFileSync(new URL(`../src/character/slime/${name}.ts`, import.meta.url), 'utf8');
  let code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  code = code.replace(/from ['"]\.\/([^'"]+)['"]/g, (_, dependency) => `from '${load(dependency)}'`);
  const url = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
  urls.set(name, url); return url;
}
const { normalizePose, pathString, morph, sampleTrack } = await import(load('poses'));
const { EmotionTransitionController, normalizeEmotion } = await import(load('EmotionTransitionController'));
const { CharacterController, initialCharacterState } = await import(load('CharacterController'));
const { SlimeController } = await import(load('SlimeController'));
const files = readdirSync(new URL('../common/', import.meta.url)).filter((v) => /slime-cercle-.*\.svg/.test(v));
const poses = Object.fromEntries(files.map((file) => [file.slice(13, -16), normalizePose(readFileSync(new URL(`../common/${file}`, import.meta.url), 'utf8'))]));
// Derive names independently of the runtime registry.
assert.ok(poses.neutre);
for (const [emotion, pose] of Object.entries(poses)) {
  test(`${emotion}: source paths and all animation matrices normalize losslessly`, () => {
    const svg = readFileSync(new URL(`../common/slime-cercle-${emotion}-encre-anime.svg`, import.meta.url), 'utf8');
    const paths = [...svg.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(pathString(pose.body), paths[0]);
    pose.eyes.forEach((p, i) => assert.equal(pathString(p), paths[i + 1]));
    for (const target of Object.values(poses)) {
      assert.deepEqual(morph(pose.body, target.body, 1), target.body);
      pose.eyes.forEach((p, i) => {
        assert.deepEqual(morph(p, target.eyes[i], 0), p);
        assert.deepEqual(morph(p, target.eyes[i], 1), target.eyes[i]);
      });
    }
    pose.tracks.forEach((track) => {
      assert.equal(track.length, 90);
      for (const f of track) sampleTrack(track, f.offset * pose.duration, pose.duration).forEach((v, i) => assert.ok(Math.abs(v - f.matrix[i]) < 1e-8));
    });
  });
}
test('invalid names fall back without accepting inherited properties or activities', () => {
  for (const v of ['thinking', 'toString', '__proto__', '', null]) assert.equal(normalizeEmotion(v, poses), 'neutre');
});
test('transition completes at exact target and uses independent part timings', () => {
  const c = new EmotionTransitionController(poses);
  c.request('heureux', 0);
  const halfway = c.sample(280);
  assert.deepEqual(halfway.eyes, poses.heureux.eyes);
  assert.equal(c.completed, false);
  c.sample(460);
  assert.equal(c.currentEmotion, 'heureux'); assert.equal(c.progress, 1); assert.equal(c.completed, true);
});
test('interruptions and rapid requests preserve the current interpolated pose', () => {
  const c = new EmotionTransitionController(poses);
  c.request('triste', 0);
  for (let i = 1; i < 80; i++) {
    const now = i * 12;
    const before = c.sample(now);
    c.request(i % 2 ? 'heureux' : 'mefiant', now);
    assert.deepEqual(c.sample(now), before);
  }
  c.sample(2000); assert.equal(c.currentEmotion, c.targetEmotion); assert.ok(c.interruptions > 70);
});
test('idle interruption starts from the source animation phase', () => {
  const c = new EmotionTransitionController(poses);
  c.request('surpris', 1100);
  assert.deepEqual(c.sample(1100).matrices, poses.neutre.tracks.map((t) => sampleTrack(t, 1100, poses.neutre.duration)));
});
test('activity and interaction state remain independent of emotion', () => {
  const c = new CharacterController();
  c.update({ emotion: 'triste' }); c.update({ activity: 'thinking', hover: true });
  assert.equal(c.state.emotion, 'triste'); assert.equal(c.state.activity, 'thinking');
});
function harness() {
  let now = 0, id = 0; const pending = new Map(); const frames = [];
  const scheduler = { now: () => now, request: (f) => { pending.set(++id, f); return id; }, cancel: (key) => pending.delete(key) };
  const c = new SlimeController(poses, initialCharacterState, scheduler, (f) => frames.push(f));
  return { c, frames, pending, step(time) { now = time; const callbacks = [...pending.values()]; pending.clear(); callbacks.forEach((f) => f(time)); } };
}
test('one frame chain, idle sleeps, dispose cancels, and reduced motion resolves immediately', () => {
  const h = harness();
  h.c.update({ ...initialCharacterState, emotion: 'surpris' }, false, true);
  assert.equal(h.pending.size, 1);
  h.c.update({ ...initialCharacterState, emotion: 'heureux' }, false, true);
  assert.equal(h.pending.size, 1);
  h.step(500); assert.equal(h.pending.size, 0);
  h.c.update({ ...initialCharacterState, emotion: 'triste', pressed: true }, true, true);
  assert.equal(h.pending.size, 0); assert.equal(h.c.emotions.currentEmotion, 'triste'); assert.equal(h.frames.at(-1).idle, false);
  h.c.update({ ...initialCharacterState, emotion: 'hilare' }, false, true);
  h.c.dispose(); assert.equal(h.pending.size, 0);
});
test('animation disabled snaps to target without scheduling work', () => {
  const h = harness(); h.c.update({ ...initialCharacterState, emotion: 'colere' }, false, false);
  assert.equal(h.pending.size, 0); assert.equal(h.c.emotions.currentEmotion, 'colere');
});
test('optional bridge policy uses one waypoint without routing every emotion through neutral', () => {
  const c = new EmotionTransitionController(poses, 'triste', (from, to) => from === 'triste' && to === 'heureux' ? 'attentif' : undefined);
  c.request('heureux', 0); c.sample(460);
  assert.deepEqual(c.visual.eyes, poses.attentif.eyes); assert.equal(c.completed, false);
  c.sample(920); assert.equal(c.currentEmotion, 'heureux'); assert.equal(c.completed, true);
});
