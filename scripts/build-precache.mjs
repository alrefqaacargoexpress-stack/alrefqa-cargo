import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
const root = path.resolve('dist/public');
async function files(dir) {
  const list = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) list.push(...await files(absolute));
    else list.push('/' + path.relative(root, absolute).split(path.sep).join('/'));
  }
  return list;
}
const list = (await files(root)).filter(file => !file.split('/').some(segment => segment.startsWith('.')) && !file.startsWith('/api/') && !file.startsWith('/__manus__/') && file !== '/sw.js' && file !== '/precache-manifest.js');
const id = createHash('sha256').update(await readFile(path.join(root, 'index.html'))).digest('hex').slice(0, 16);
const precache = ['/', ...list.filter(file => file !== '/index.html')].sort();
await writeFile(path.join(root, 'precache-manifest.js'), `self.ALREFQA_BUILD_ID = ${JSON.stringify(id)};\nself.ALREFQA_PRECACHE = ${JSON.stringify(precache)};\n`);
console.log(`Offline precache: ${precache.length} files, version ${id}`);
