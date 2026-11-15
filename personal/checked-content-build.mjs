// Reuse the pinned upstream loader without its page stores, networking or UI.
import {parse} from 'acorn';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';

export function extractCheckedContent(source) {
  const names = ['sleep', 'CONTENT_RETRY_MS', 'CONTENT_TIMEOUT_MS', 'fetchChecked'];
  const declarations = new Map();
  for (const node of parse(source, {ecmaVersion:'latest', sourceType:'module'}).body) {
    const declaration = node.type === 'ExportNamedDeclaration' ? node.declaration : node;
    const name = declaration?.type === 'FunctionDeclaration' ? declaration.id?.name
      : declaration?.type === 'VariableDeclaration' && declaration.declarations.length === 1 ? declaration.declarations[0].id.name : null;
    if (names.includes(name)) declarations.set(name, source.slice(node.start, node.end));
  }
  const selected = names.map(name => declarations.get(name)).join('\n\n');
  // SHA-256 of these exact declarations from upstream 0.3.3 / f07b8965061bbc3.
  // Fail closed on helper/dependency drift; review this contract before rebasing.
  if (declarations.size !== names.length || createHash('sha256').update(selected).digest('hex') !==
      '6e2f2b1c16f6d013493aead033ad2698171d822710059fff6456e73815d04c69') {
    throw new Error('Upstream checked-content adapter contract changed');
  }
  return '// Extracted unchanged from upstream/public/js/content.js (GPL-3.0-or-later).\n' +
    "import {sha256Hex} from '../../shared/sha256.js';\n" + selected + '\n';
}

export const checkedContentPlugin = {
  name:'personal-checked-content',
  setup(plugin) {
    plugin.onLoad({filter:/\/upstream\/public\/js\/content\.js$/}, async ({path:file}) => ({
      contents:extractCheckedContent(await readFile(file,'utf8')), loader:'js', resolveDir:path.dirname(file),
    }));
  },
};
