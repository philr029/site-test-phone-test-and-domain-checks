/**
 * Validates dashboard assets and syncs sample data into docs/.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const required = [
  'docs/index.html',
  'docs/styles.css',
  'docs/js/app.js',
  'docs/js/services/domain-client.js',
  'docs/js/pages/spreadsheet.js',
  'src/api/server.js',
  'samples/domains-sample.csv'
];

for (const rel of required) {
  await fs.access(path.join(root, rel));
}

const sampleSrc = path.join(root, 'samples/domains-sample.csv');
const sampleDest = path.join(root, 'docs/samples/domains-sample.csv');
await fs.mkdir(path.dirname(sampleDest), { recursive: true });
await fs.copyFile(sampleSrc, sampleDest);

console.log('Dashboard build OK:', required.length, 'files verified');
