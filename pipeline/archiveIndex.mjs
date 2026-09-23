/**
 * アーカイブの目次を作る（public/data/archive/index.json）。
 *
 * 画面の「過去へ移動」がどの日付を選べるかを知るために使う。
 * ディレクトリを読むだけなので、`npm run build` のたびに作り直す（package.json の prebuild）。
 * 深掘り2系統はクラウドの定期実行が push するだけでビルドを回さないが、
 * その push が GitHub Actions を起動し、そこで build が走るので目次も最新になる。
 *
 * 生成物は .gitignore に入れてある。コミットせず、ビルドのたびに作る。
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const ARCHIVE_DIR = path.join(ROOT, 'public', 'data', 'archive');

/** `2026-09-21-domestic.json` のような名前から日付と系統を取り出す */
const FILE = /^(\d{4}-\d{2}-\d{2})-(domestic|intl|ai)\.json$/;

export function buildArchiveIndex() {
  if (!fs.existsSync(ARCHIVE_DIR)) return { dates: [] };

  const byDate = new Map();
  for (const name of fs.readdirSync(ARCHIVE_DIR)) {
    const m = name.match(FILE);
    if (!m) continue;
    const [, date, stream] = m;
    if (!byDate.has(date)) byDate.set(date, new Set());
    byDate.get(date).add(stream);
  }

  const dates = [...byDate.entries()]
    .map(([date, streams]) => ({ date, streams: [...streams].sort() }))
    .sort((a, b) => (a.date < b.date ? 1 : -1)); // 新しい順

  return { generatedAt: new Date().toISOString(), dates };
}

const index = buildArchiveIndex();
fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
fs.writeFileSync(path.join(ARCHIVE_DIR, 'index.json'), JSON.stringify(index, null, 2) + '\n');
console.log(`[archive] 目次を作成: ${index.dates.length}日分`);
