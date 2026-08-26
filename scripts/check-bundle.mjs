import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const assetsDirectory = new URL('../dist/assets/', import.meta.url);
const limits = { entry: 450 * 1024, chunk: 60 * 1024, css: 90 * 1024 };
const files = await readdir(assetsDirectory);
const failures = [];

for (const file of files) {
  const bytes = (await stat(join(assetsDirectory.pathname, file))).size;
  const limit = file.endsWith('.css') ? limits.css : file.startsWith('index-') ? limits.entry : limits.chunk;
  if (bytes > limit) failures.push(`${file}: ${bytes} bytes > ${limit} bytes`);
}

if (failures.length) {
  console.error(`Превышен budget сборки:\n${failures.join('\n')}`);
  process.exit(1);
}

console.log('Размеры production-чанков укладываются в budget.');
