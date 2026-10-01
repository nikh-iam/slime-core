import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import ts from 'typescript';

// Compile the pure helper in memory with the project's existing TS dependency.
const source = readFileSync(new URL('../src/character/slime/svg.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { themeSlimeSvg } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const directory = new URL('../common/', import.meta.url);
const files = readdirSync(directory).filter((file) => /^slime-cercle-.*-encre-anime\.svg$/.test(file));

test('every supplied emotion is registered and exported as a subcomponent', () => {
  assert.equal(files.length, 16);
  const registry = readFileSync(new URL('../src/character/slime/assets.ts', import.meta.url), 'utf8');
  const components = readFileSync(new URL('../src/character/slime/emotions.tsx', import.meta.url), 'utf8');
  for (const file of files) {
    const emotion = file.slice('slime-cercle-'.length, -'-encre-anime.svg'.length);
    assert.ok(registry.includes(`${file}?raw`), `Missing source import: ${emotion}`);
    assert.ok(components.includes(`emotion="${emotion}"`), `Missing emotion component: ${emotion}`);
  }
});

for (const file of files) {
  test(`${file}: colors change without damaging masks or animation`, () => {
    const original = readFileSync(new URL(file, directory), 'utf8');
    const themed = themeSlimeSvg(original, '#ffffff', '#000000', true);
    assert.ok(themed.includes('fill="#ffffff"'));
    assert.ok(themed.includes('fill="#000000"'));
    assert.ok(!themed.includes('fill="#0a0a0c"'));
    assert.ok(!themed.includes('fill="#f9f9f9"'));
    assert.equal(themed.match(/<defs>[\s\S]*?<\/defs>/)?.[0], original.match(/<defs>[\s\S]*?<\/defs>/)?.[0]);
    assert.equal(themed.match(/<style>[\s\S]*?<\/style>/)?.[0], original.match(/<style>[\s\S]*?<\/style>/)?.[0]);
    assert.ok(themed.includes('@media(prefers-reduced-motion:reduce)'));
  });
}

test('paused mode preserves transforms and escapes color attribute values', () => {
  const original = readFileSync(new URL(files[0], directory), 'utf8');
  const themed = themeSlimeSvg(original, '"/><script>bad()</script><g fill="', 'black', false);
  assert.ok(!themed.includes('<script>'));
  assert.ok(themed.includes('&quot;'));
  assert.ok(themed.includes('animation-play-state:paused!important'));
  assert.ok(!themed.includes('@media'));
  assert.ok(themed.includes('@keyframes oeil0'));
});
