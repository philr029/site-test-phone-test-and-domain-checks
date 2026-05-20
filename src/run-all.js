import { spawn } from 'node:child_process';
import { loadTargetsConfig } from './config/target-loader.js';
import { buildRunReport, writeReports } from './reporting/report-builder.js';

const commands = [
  ['npm', ['run', 'test:form-popup']],
  ['npm', ['run', 'test:phone']],
  ['npm', ['run', 'test:domain']]
];

const runCommand = ([cmd, args]) =>
  new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
    child.on('close', (code) => resolve(code ?? 1));
  });

const run = async () => {
  const exitCodes = [];

  for (const command of commands) {
    const code = await runCommand(command);
    exitCodes.push(code);
  }

  const config = await loadTargetsConfig();
  const report = await buildRunReport(config.environment);
  await writeReports(report);

  console.log(`\nReport saved: reports/run-report.json and reports/run-report.html`);
  console.log(`Overall status: ${report.status}`);

  if (exitCodes.some((code) => code !== 0) || report.status === 'failed') {
    process.exit(1);
  }
};

run();
