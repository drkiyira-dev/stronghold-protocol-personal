import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import {replaceContract} from './build-identity.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const shims = path.join(here, 'shims');
const outfile = process.argv[2] ? path.resolve(process.argv[2]) : path.join(here, '../dist/personal/local-server.js');
const aliases = {
  name: 'personal-browser-adapters',
  setup(plugin) {
    plugin.onResolve({ filter: /^node:crypto$/ }, () => ({ path: path.join(shims, 'crypto.mjs') }));
    plugin.onResolve({ filter: /^node:net$/ }, () => ({ path: path.join(shims, 'net.mjs') }));
    plugin.onResolve({ filter: /(?:^|\/)llmGate\.js$/ }, () => ({ path: path.join(shims, 'llm.mjs') }));
    plugin.onResolve({ filter: /(?:^|\/)nodeData\.js$/ }, () => ({ path: path.join(shims, 'node-data.mjs') }));
    plugin.onResolve({ filter: /(?:^|\/)testMode\.js$/ }, args => {
      if (path.resolve(args.resolveDir, args.path).endsWith('/upstream/server/testMode.js')) return { path: path.join(shims, 'test-mode.mjs') };
      return null;
    });
    plugin.onResolve({ filter: /(?:^|\/)data\.js$/ }, args => {
      const resolved = path.resolve(args.resolveDir, args.path);
      if (resolved.endsWith('/upstream/server/data.js')) return { path: path.join(shims, 'data.mjs') };
      return null;
    });
    plugin.onLoad({ filter: /server\/sim\/content\/(?:index|bands|bonds)\.js$/ }, async args => {
      const source = await readFile(args.path, 'utf8');
      const modules = path.basename(args.path) === 'index.js'
        ? ['./kits/index.js', ...['tokens', 'devices', 'enemies', 'bosses', 'bonds', 'garrisons', 'items', 'bands', 'choices'].map(name => `./${name}.js`)]
        : path.basename(args.path) === 'bonds.js' ? ['./bonds/core.js', './bonds/addon.js', './support/meta.js']
          : ['./bands/battle.js', './bands/meta.js'];
      const dispatch = `{${modules.map(name => `${JSON.stringify(name)}: () => import(${JSON.stringify(name)})`).join(',')}}`;
      return { contents: replaceContract(source,'return await import(path);', `return await (${dispatch})[path]();`,args.path), loader: 'js', resolveDir: path.dirname(args.path) };
    });
  },
};
const result = await build({
  entryPoints: [path.join(here, 'local-server.mjs')], outfile, bundle: true,
  format: 'esm', platform: 'browser', target: 'es2022', minify: false, sourcemap: false,
  define: { 'process.env': '{}', 'process.versions.node': 'undefined' },
  banner: { js: 'globalThis.setImmediate ||= (fn, ...args) => setTimeout(fn, 0, ...args);\nvar Buffer = { byteLength: value => new TextEncoder().encode(String(value)).byteLength };' },
  plugins: [aliases], metafile: true, legalComments: 'inline',
});
console.log(JSON.stringify({ outfile, bytes: result.metafile.outputs[Object.keys(result.metafile.outputs)[0]].bytes, modules: Object.keys(result.metafile.inputs).length }));
