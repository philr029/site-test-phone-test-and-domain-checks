import { spawn } from 'node:child_process';

const commands = [
  ['node', ['src/form-popup-test.js']],
  ['node', ['src/twilio-verification-test.js']],
  ['node', ['src/domain-health-check.js']]
];

const runCommand = ([cmd, args]) =>
  new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: 'inherit' });
    child.on('close', (code) => resolve(code ?? 1));
  });

const run = async () => {
  const exitCodes = [];

  for (const command of commands) {
    const code = await runCommand(command);
    exitCodes.push(code);
  }

  if (exitCodes.some((code) => code !== 0)) {
    process.exit(1);
  }
};

run();
