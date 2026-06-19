import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  runBatch,
  resolveCheckTargets,
  suggestCheckMapping
} from '../../docs/js/spreadsheet/batch-processor.js';

describe('spreadsheet batch processor', () => {
  const mockRunners = {
    runDomainCheck: async (target) => ({
      target,
      summary: { pass: 2, warn: 0, fail: 0, skip: 0 }
    }),
    runSiteCheck: async (url) => ({
      url,
      summary: { pass: 1, warn: 1, fail: 0, skip: 0 }
    }),
    runPhoneTest: async ({ phoneNumber }) => ({
      phoneNumber,
      passed: true,
      status: 'pass'
    })
  };

  it('resolveCheckTargets uses column mapping', () => {
    const row = {
      index: 1,
      cells: ['Acme', 'example.com', '+44123', 'https://acme.com'],
      cleaned: ['Acme', 'example.com', '+441234567890', 'https://acme.com'],
      company: 'Acme'
    };
    const targets = resolveCheckTargets(row, { domain: 1, phone: 2, site: 3 }, 'cleaned');
    assert.equal(targets.domain, 'example.com');
    assert.equal(targets.phone, '+441234567890');
    assert.equal(targets.site, 'https://acme.com');
  });

  it('suggestCheckMapping uses auto-detected columns', () => {
    const headers = ['company', 'domain', 'phone', 'website'];
    const mapping = suggestCheckMapping(headers, { domain: 1, phone: 2, website: 3 });
    assert.equal(mapping.domain, 1);
    assert.equal(mapping.phone, 2);
    assert.equal(mapping.site, 3);
  });

  it('runBatch skips invalid rows without calling runners', async () => {
    const calls = { domain: 0 };
    const runners = {
      ...mockRunners,
      runDomainCheck: async () => {
        calls.domain++;
        return { summary: { pass: 1, warn: 0, fail: 0, skip: 0 } };
      }
    };

    const rows = [
      { index: 1, valid: false, issues: ['bad'], cells: [''], cleaned: [''] },
      { index: 2, valid: true, cells: ['', 'example.com'], cleaned: ['', 'example.com'], domain: 'example.com' }
    ];

    const { results, summary } = await runBatch({
      rows,
      checkTypes: ['domain'],
      checkMapping: { domain: 1 },
      runners,
      onProgress: () => {}
    });

    assert.equal(calls.domain, 1);
    assert.equal(results[0].status, 'warn');
    assert.equal(results[1].status, 'pass');
    assert.equal(summary.pass, 1);
    assert.equal(summary.warn, 1);
  });

  it('runBatch runs multiple check types per row', async () => {
    const types = [];
    const runners = {
      runDomainCheck: async () => {
        types.push('domain');
        return { summary: { pass: 1, warn: 0, fail: 0, skip: 0 } };
      },
      runSiteCheck: async () => {
        types.push('site');
        return { summary: { pass: 1, warn: 0, fail: 0, skip: 0 } };
      },
      runPhoneTest: async () => {
        types.push('phone');
        return { passed: true, status: 'pass' };
      }
    };

    const rows = [{
      index: 1,
      valid: true,
      cells: ['example.com', '+44123', 'https://example.com'],
      cleaned: ['example.com', '+441234567890', 'https://example.com'],
      domain: 'example.com',
      phone: '+441234567890',
      url: 'https://example.com'
    }];

    const { results } = await runBatch({
      rows,
      checkTypes: ['domain', 'site', 'phone'],
      checkMapping: { domain: 0, phone: 1, site: 2 },
      runners
    });

    assert.deepEqual(types.sort(), ['domain', 'phone', 'site']);
    assert.ok(results[0].checks.domain);
    assert.ok(results[0].checks.site);
    assert.ok(results[0].checks.phone);
  });

  it('runBatch reports progress', async () => {
    const progress = [];
    await runBatch({
      rows: [
        { index: 1, valid: true, cells: ['a.com'], cleaned: ['a.com'], domain: 'a.com' },
        { index: 2, valid: true, cells: ['b.com'], cleaned: ['b.com'], domain: 'b.com' }
      ],
      checkTypes: ['domain'],
      checkMapping: { domain: 0 },
      runners: mockRunners,
      onProgress: (p) => progress.push(p.percent)
    });
    assert.deepEqual(progress, [50, 100]);
  });
});
