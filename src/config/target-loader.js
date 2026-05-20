import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const targetsPath = path.join(repoRoot, 'config', 'targets.json');

const normalizeArray = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);

const normalizeWebsite = (target) => {
  const website = target.website || {};
  const legacyForm = target.form || {};
  const legacyPopup = target.popup || {};

  const formSelector = website.formSelector || legacyForm.selector || 'form';
  const popupChecks = normalizeArray(website.popupChecks);

  return {
    url: website.url || target.url || '',
    formUrl: website.formUrl || website.url || target.url || '',
    safeToSubmit: website.safeToSubmit === true,
    form: {
      selector: formSelector,
      submitSelector: website.submitSelector || legacyForm.submitSelector || "button[type='submit']",
      successSelector: website.successSelector || legacyForm.successSelector || '',
      successUrlContains: website.successUrlContains || legacyForm.successUrlContains || '',
      expectedSuccessText: website.expectedSuccessText || '',
      fields: normalizeArray(website.fields)
    },
    popup: {
      enabled: legacyPopup.enabled !== false,
      closeSelectors: normalizeArray(legacyPopup.closeSelectors)
    },
    popupChecks: popupChecks.length
      ? popupChecks
      : normalizeArray(website.popupSelectors).map((item) => ({
          name: item.name || 'Popup',
          selector: item.selector,
          expectedText: item.expectedText || '',
          critical: Boolean(item.critical)
        }))
  };
};

const normalizePhone = (target) => {
  const phone = target.phone || {};
  return {
    enabled: phone.enabled === true,
    number: phone.number || '',
    expectedBehaviour: phone.expectedBehaviour || 'should ring'
  };
};

const normalizeDomain = (target) => {
  const domain = target.domain || {};
  const legacyMx = target.mxtoolbox || {};

  return {
    enabled: domain.enabled !== false && (domain.domain || domain.ip || legacyMx.domains?.length || legacyMx.ips?.length),
    domain: domain.domain || legacyMx.domains?.[0] || '',
    ip: domain.ip || legacyMx.ips?.[0] || '',
    legacyMx
  };
};

const normalizeTarget = (target) => {
  const website = normalizeWebsite(target);
  const phone = normalizePhone(target);
  const domain = normalizeDomain(target);

  return {
    name: target.name,
    enabled: target.enabled !== false,
    url: website.url,
    formUrl: website.formUrl,
    safeToSubmit: website.safeToSubmit,
    form: website.form,
    popup: website.popup,
    popupChecks: website.popupChecks,
    phone,
    domain,
    mxtoolbox: {
      domains: normalizeArray(domain.domain ? [domain.domain] : domain.legacyMx?.domains),
      ips: normalizeArray(domain.ip ? [domain.ip] : domain.legacyMx?.ips)
    }
  };
};

export const loadTargetsConfig = async () => {
  const raw = await fs.readFile(targetsPath, 'utf8');
  const parsed = JSON.parse(raw);

  return {
    environment: parsed.environment || process.env.TEST_ENVIRONMENT || 'unknown',
    defaults: parsed.defaults || {},
    targets: normalizeArray(parsed.targets).map(normalizeTarget)
  };
};

export const getSelectedTargets = async () => {
  const config = await loadTargetsConfig();
  const selectedName = process.env.TARGET_NAME?.trim();

  let targets = config.targets.filter((target) => target.enabled !== false);

  if (selectedName) {
    targets = targets.filter((target) => target.name === selectedName);
  }

  if (selectedName && targets.length === 0) {
    throw new Error(`No enabled target found in config/targets.json for TARGET_NAME=${selectedName}`);
  }

  return {
    environment: config.environment,
    defaults: config.defaults,
    targets
  };
};

export const getPhoneTargets = async () => {
  const { environment, targets } = await getSelectedTargets();
  return {
    environment,
    targets: targets.filter((target) => target.phone?.enabled && target.phone?.number)
  };
};

export const flattenMxTargets = (targets) => {
  const checks = [];

  for (const target of targets) {
    if (target.domain?.enabled === false) continue;

    for (const domain of normalizeArray(target?.mxtoolbox?.domains)) {
      checks.push({ sourceTarget: target.name, target: domain, type: 'domain' });
    }

    for (const ip of normalizeArray(target?.mxtoolbox?.ips)) {
      checks.push({ sourceTarget: target.name, target: ip, type: 'ip' });
    }
  }

  return checks;
};
