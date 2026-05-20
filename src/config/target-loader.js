import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const targetsPath = path.join(repoRoot, 'config', 'targets.json');

const normalizeArray = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);

export const loadTargetsConfig = async () => {
  const raw = await fs.readFile(targetsPath, 'utf8');
  const parsed = JSON.parse(raw);

  return {
    environment: parsed.environment || process.env.TEST_ENVIRONMENT || 'unknown',
    defaults: parsed.defaults || {},
    targets: normalizeArray(parsed.targets)
  };
};

export const getSelectedTargets = async () => {
  const config = await loadTargetsConfig();
  const selectedName = process.env.TARGET_NAME?.trim();

  const targets = selectedName
    ? config.targets.filter((target) => target.name === selectedName)
    : config.targets;

  if (selectedName && targets.length === 0) {
    throw new Error(`No target found in config/targets.json for TARGET_NAME=${selectedName}`);
  }

  return {
    environment: config.environment,
    defaults: config.defaults,
    targets
  };
};

export const flattenMxTargets = (targets) => {
  const checks = [];

  for (const target of targets) {
    for (const domain of normalizeArray(target?.mxtoolbox?.domains)) {
      checks.push({ sourceTarget: target.name, target: domain, type: 'domain' });
    }

    for (const ip of normalizeArray(target?.mxtoolbox?.ips)) {
      checks.push({ sourceTarget: target.name, target: ip, type: 'ip' });
    }
  }

  return checks;
};
