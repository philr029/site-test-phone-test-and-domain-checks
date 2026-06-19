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
  'docs/js/spreadsheet/index.js',
  'docs/js/spreadsheet/constants.js',
  'docs/js/spreadsheet/parser.js',
  'docs/js/spreadsheet/validation.js',
  'docs/js/spreadsheet/file-handler.js',
  'docs/js/spreadsheet/batch-processor.js',
  'docs/js/spreadsheet/table-ui.js',
  'docs/js/spreadsheet/worker.js',
  'docs/js/ingestion/index.js',
  'docs/js/ingestion/FileUpload.js',
  'docs/js/ingestion/ParserWorker.js',
  'docs/js/ingestion/parser-worker.js',
  'docs/js/ingestion/ColumnMapper.js',
  'docs/js/ingestion/constants.js',
  'docs/js/services/ingestion-client.js',
  'docs/js/services/spreadsheet.js',
  'docs/js/services/domain-client.js',
  'docs/js/services/site-client.js',
  'docs/js/services/phone-client.js',
  'docs/js/pages/spreadsheet.js',
  'src/api/server.js',
  'samples/domains-sample.csv',
  'samples/multi-check-sample.csv'
];

for (const rel of required) {
  await fs.access(path.join(root, rel));
}

const samples = ['domains-sample.csv', 'multi-check-sample.csv'];
for (const name of samples) {
  const src = path.join(root, 'samples', name);
  const dest = path.join(root, 'docs/samples', name);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(src, dest);
}

console.log('Dashboard build OK:', required.length, 'files verified');
