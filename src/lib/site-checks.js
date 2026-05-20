/**
 * Lightweight site checks via HTTP fetch (dashboard API — not full Playwright).
 */
const FETCH_TIMEOUT_MS = 15000;

const fetchWithTimeout = async (url) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const start = Date.now();
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'QA-Dashboard/1.0 (+https://github.com/philr029/site-test-phone-test-and-domain-checks)' }
    });
    const html = await res.text();
    return { res, html, durationMs: Date.now() - start };
  } finally {
    clearTimeout(timeout);
  }
};

const statusFromPassed = (passed, skipped = false) => {
  if (skipped) return 'skip';
  if (passed === null || passed === undefined) return 'warn';
  return passed ? 'pass' : 'fail';
};

export const runSiteChecks = async (url) => {
  const normalized = url.startsWith('http') ? url : `https://${url}`;
  const checks = [];
  let pageHtml = '';
  let loadMs = 0;
  let reachable = false;

  try {
    const { res, html, durationMs } = await fetchWithTimeout(normalized);
    pageHtml = html;
    loadMs = durationMs;
    reachable = res.ok || res.status < 500;

    checks.push({
      id: 'page-load',
      name: 'Page load',
      passed: reachable && durationMs < 8000,
      status: statusFromPassed(reachable && durationMs < 8000),
      detail: reachable
        ? `Loaded in ${durationMs}ms (HTTP ${res.status})`
        : `HTTP ${res.status} — page may be unavailable`
    });
  } catch (error) {
    checks.push({
      id: 'page-load',
      name: 'Page load',
      passed: false,
      status: 'fail',
      detail: error.message || 'Request failed'
    });
    return {
      url: normalized,
      checks,
      summary: { pass: 0, warn: 0, fail: 1, skip: 0 },
      checkedAt: new Date().toISOString()
    };
  }

  const lower = pageHtml.toLowerCase();

  const hasForm = /<form[\s>]/i.test(pageHtml);
  checks.push({
    id: 'form',
    name: 'Form test',
    passed: hasForm,
    status: statusFromPassed(hasForm),
    detail: hasForm ? 'At least one <form> element found' : 'No form element detected in HTML'
  });

  const popupPatterns = [
    { name: 'Cookie / consent', pattern: /cookie|consent|gdpr/i },
    { name: 'Modal / popup', pattern: /modal|popup|overlay|dialog/i },
    { name: 'Newsletter / CTA', pattern: /newsletter|subscribe|cta/i }
  ];
  for (const { name, pattern } of popupPatterns) {
    const found = pattern.test(lower) || pattern.test(pageHtml);
    checks.push({
      id: `popup-${name}`,
      name: `Popup: ${name}`,
      passed: found,
      status: statusFromPassed(found),
      detail: found ? 'Related markup or keywords detected' : 'No matching patterns in page HTML'
    });
  }

  const bannerFound = /banner|hero|announcement/i.test(lower);
  checks.push({
    id: 'banner',
    name: 'Banner test',
    passed: bannerFound,
    status: statusFromPassed(bannerFound),
    detail: bannerFound ? 'Banner/hero-related content detected' : 'No banner patterns detected'
  });

  const linkMatches = pageHtml.match(/href=["']([^"']+)["']/gi) || [];
  const links = linkMatches
    .map((m) => m.replace(/^href=["']/i, '').replace(/["']$/, ''))
    .filter((href) => href && !href.startsWith('#') && !href.startsWith('mailto:') && !href.startsWith('tel:'))
    .slice(0, 12);

  let broken = 0;
  const sampled = links.slice(0, 5);
  for (const href of sampled) {
    try {
      const absolute = new URL(href, normalized).href;
      const head = await fetch(absolute, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
      if (!head.ok && head.status !== 405) broken += 1;
    } catch {
      broken += 1;
    }
  }

  checks.push({
    id: 'broken-links',
    name: 'Broken link check',
    passed: broken === 0,
    status: statusFromPassed(broken === 0),
    detail:
      sampled.length === 0
        ? 'No links sampled'
        : `Sampled ${sampled.length} links — ${broken} issue(s) detected`
  });

  const summary = checks.reduce(
    (acc, c) => {
      acc[c.status === 'pass' ? 'pass' : c.status === 'fail' ? 'fail' : c.status === 'skip' ? 'skip' : 'warn'] += 1;
      return acc;
    },
    { pass: 0, warn: 0, fail: 0, skip: 0 }
  );

  return {
    url: normalized,
    loadMs,
    checks,
    summary,
    checkedAt: new Date().toISOString()
  };
};
