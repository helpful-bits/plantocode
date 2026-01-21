#!/usr/bin/env node
import { globby } from 'globby';
import { readFile } from 'fs/promises';
import path from 'path';

function flatten(input, prefix = '') {
  const out = {};
  for (const [k, v] of Object.entries(input || {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (Array.isArray(v)) {
      out[key] = v;
      v.forEach((item, index) => {
        const itemKey = `${key}.${index}`;
        if (Array.isArray(item)) {
          out[itemKey] = item;
        } else if (item && typeof item === 'object') {
          Object.assign(out, flatten(item, itemKey));
        } else {
          out[itemKey] = String(item ?? '');
        }
      });
    } else if (v && typeof v === 'object') {
      Object.assign(out, flatten(v, key));
    } else {
      out[key] = String(v ?? '');
    }
  }
  return out;
}

async function loadLocale(locale) {
  const root = `src/messages/${locale}`;
  const namespaces = ['common', 'seo', 'home', 'features', 'docs', 'pages', 'legal'];
  const files = await globby(namespaces.map((ns) => `${root}/${ns}.json`));
  const flatByFile = {};
  const owners = {};
  for (const f of files) {
    const json = JSON.parse(await readFile(f, 'utf8'));
    const flat = flatten(json);
    flatByFile[f] = flat;
    for (const [k] of Object.entries(flat)) {
      owners[k] ||= [];
      owners[k].push(f);
    }
  }
  const merged = {};
  for (const flat of Object.values(flatByFile)) Object.assign(merged, flat);
  return { files, flatByFile, merged, owners };
}

async function main() {
  const usedPath = process.argv[2] || '.i18n.used.json';
  const used = JSON.parse(await readFile(usedPath, 'utf8'));
  const locales = ['en', 'de'];
  let exit = 0;

  for (const loc of locales) {
    const { merged, owners } = await loadLocale(loc);
    const mergedKeys = Object.keys(merged);
    const mergedKeySet = new Set(mergedKeys);
    const missing = used.usedKeys.filter((k) => {
      if (mergedKeySet.has(k)) return false;
      const prefix = `${k}.`;
      return !mergedKeys.some((existing) => existing.startsWith(prefix));
    });
    const collisions = Object.entries(owners).filter(([, v]) => v.length > 1);

    if (missing.length) {
      exit = 1;
      console.error(`[${loc}] Missing keys (${missing.length}):`);
      for (const k of missing) console.error(`  - ${k}`);
    }
    if (collisions.length) {
      exit = 1;
      console.error(`[${loc}] Collisions (${collisions.length}):`);
      for (const [k, v] of collisions) console.error(`  - ${k} <= ${v.map((p) => path.relative(process.cwd(), p)).join(', ')}`);
    }
  }

  const en = await loadLocale('en');
  const defined = new Set(Object.keys(en.merged));
  const unused = Array.from(defined).filter((k) => !used.usedKeys.includes(k));
  if (unused.length) {
    console.log(`[info] Unused keys in en: ${unused.length}`);
  }

  process.exit(exit);
}

main().catch((e) => { console.error(e); process.exit(1); });
