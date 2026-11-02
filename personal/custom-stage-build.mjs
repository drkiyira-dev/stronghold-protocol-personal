import {readFile, mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readPluginFolder} from '../upstream/server/plugins/registry.js';
import {buildContentSet, contentSetFiles} from '../upstream/server/plugins/contentSet.js';
import {Grid} from '../upstream/server/sim/grid.js';
import {validateStageDescriptor} from './custom-stage.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
export async function buildCustomStage(dist = path.join(root, 'dist')) {
  const dir = path.join(root, 'personal/stages/rainfall-defense');
  const records = JSON.parse(await readFile(path.join(dir, 'content.json'), 'utf8'));
  const stage = validateStageDescriptor(records.entries.find(e => e.file === 'stages')?.value?.options?.originalStage);
  const loaded = readPluginFolder(dir);
  if (!loaded.plugin || loaded.problems.length) throw new Error(JSON.stringify(loaded.problems));
  const registry = {plugin: id => id === stage.id ? loaded.plugin : null,
    contentDirs: {dataDir: path.join(root, 'upstream/data'), simDir: path.join(root, 'upstream/server/sim'), sharedDir: path.join(root, 'upstream/shared')}};
  const base = buildContentSet({registry, ids: []});
  if (base.problems.length) throw new Error('Invalid vanilla content identity');
  const set = buildContentSet({registry, ids: [stage.id]});
  if (set.problems.length) throw new Error('Original-stage plugin: ' + JSON.stringify(set.problems));
  const terrain = set.data.stages[stage.stageId];
  const grid = new Grid({...terrain, legend: terrain.tiles}, {r0: 0, r1: 18, c0: 0, c1: 20});
  for (let n = 1; n <= stage.rounds; n++) {
    const wave = set.data.waves[set.data.config.modes[stage.modeId].rounds[n].template];
    for (const route of wave.routes) {
      const points = [route.start, ...route.checkpoints, route.end];
      for (let i = 1; i < points.length; i++) if (!grid.findPath(...points[i - 1], ...points[i])) throw new Error(`Unreachable route in assault ${n}`);
    }
  }
  const files = contentSetFiles(set), prefix = `/cs/${set.cs.slice(0, 16)}/`;
  // Only changed records and checked bounds need their own static files. The
  // upstream manifest pins unchanged files to the existing /data/ bytes.
  for (const [name, file] of files) {
    if (name !== 'index.json' && !JSON.stringify(set.index).includes(prefix + name)) continue;
    const target = path.join(dist, prefix, name);
    await mkdir(path.dirname(target), {recursive: true});
    await writeFile(target, file.body);
  }
  const descriptor = {...stage, cs: set.cs, plugin: {id: stage.id, version: stage.release, class: 'content', hash: loaded.plugin.content.hash, unofficial: true}};
  await mkdir(path.join(dist, 'personal/stages'), {recursive: true});
  await writeFile(path.join(dist, 'personal/stages/rainfall-defense.json'), JSON.stringify(descriptor));
  await writeFile(path.join(dist, 'personal/content-identity.json'), JSON.stringify({cs:base.cs}));
  return {descriptor, set};
}
