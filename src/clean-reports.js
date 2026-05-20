import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const reportsDir = path.join(repoRoot, 'reports');

const filesToRemove = [
  'phone-report.json',
  'form-popup-report.json',
  'domain-health-report.json',
  'twilio-report.json',
  'playwright-report.json',
  'run-report.json',
  'run-report.html'
];

const run = async () => {
  for (const file of filesToRemove) {
    await fs.rm(path.join(reportsDir, file), { force: true });
  }

  await fs.rm(path.join(reportsDir, 'playwright-html'), { recursive: true, force: true });
  console.log('Reports cleaned.');
};

run();
