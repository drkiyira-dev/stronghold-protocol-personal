import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parse} from '../upstream/public/vendor/acorn.mjs';

test('static browser battle entrypoints have every transitive ESM dependency, including the server data stand-in', async () => {
  const queue = ['/sim/spec.js','/sim/simdata.js','/sim/content/support/index.js','/js/battle/simLoader.js'];
  const seen = new Set();
  while (queue.length) {
    const url = queue.pop();
    if (seen.has(url)) continue;
    seen.add(url);
    const source = await readFile(new URL('../dist'+url,import.meta.url),'utf8');
    const ast = parse(source,{ecmaVersion:'latest',sourceType:'module'});
    for (const node of ast.body) {
      if (!['ImportDeclaration','ExportNamedDeclaration','ExportAllDeclaration'].includes(node.type) || !node.source) continue;
      const specifier = node.source.value;
      assert.ok(specifier.startsWith('.') || specifier.startsWith('/'), `browser import is resolvable: ${url} → ${specifier}`);
      queue.push(new URL(specifier,'https://personal.test'+url).pathname);
    }
  }
  assert.ok(seen.has('/data.js'));
  assert.ok(seen.size > 30);
});
