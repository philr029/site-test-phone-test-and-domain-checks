import { spawn } from 'node:child_process';

const commands = [
  ['npm', ['run', 'test:form-popup']],
  ['npm', ['run', 'test:twilio']],
  ['npm', ['run', 'test:domain']]
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
