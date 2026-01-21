#!/usr/bin/env node
import { globby } from 'globby';
import { readFile } from 'fs/promises';

const SRC = 'src';
const FILE_GLOBS = [`${SRC}/**/*.{ts,tsx}`];

const KEY_REGEXES = [
  /\bt\(\s*['"]([a-zA-Z0-9_.-]+)['"]\s*[),]/g,
  /\bt\[\s*['"]([a-zA-Z0-9_.-]+)['"]\s*\]/g,
];

async function main() {
  const files = await globby(FILE_GLOBS, { gitignore: true });
  const byFile = {};
  const used = new Set();
  for (const f of files) {
    const src = await readFile(f, 'utf8');
    const keys = new Set();
    for (const re of KEY_REGEXES) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(src))) keys.add(m[1]);
    }
    if (keys.size) {
      byFile[f] = Array.from(keys).sort();
      for (const k of keys) used.add(k);
    }
  }
  const out = { usedKeys: Array.from(used).sort(), byFile };
  process.stdout.write(JSON.stringify(out, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
