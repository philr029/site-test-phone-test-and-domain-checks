import { runPhoneTest } from '../services/phone-client.js';
import { saveHistoryEntry } from '../storage.js';
import { loadingHtml, emptyStateHtml } from '../components/loading.js';
import { badgeHtml } from '../components/badges.js';

const E164_REGEX = /^\+[1-9]\d{7,14}$/;

const TEST_NAME_PRESETS = {
  support: 'Support line check',
  sales: 'Sales line check',
  after_hours: 'After-hours voicemail check',
  emergency: 'Emergency callback check'
};

const EXPECTED_OUTCOME_TEMPLATES = {
  should_ring: 'should ring',
  should_answer: 'should answer',
  should_go_to_voicemail: 'should go to voicemail',
  should_be_busy: 'should be busy',
  should_fail: 'should fail'
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

export const renderPhoneTests = () => `
  <section class="page-header">
    <div>
      <p class="page-eyebrow">Telephony</p>
      <h1>Phone Tests</h1>
      <p class="page-desc">Twilio outbound tests when API is configured — mock mode otherwise. API keys never appear in the browser.</p>
    </div>
  </section>
  <form class="check-form" id="phone-check-form">
    <div class="form-grid">
      <div>
        <label for="phone-number">Phone number (E.164)</label>
        <input type="tel" id="phone-number" placeholder="+441234567890" required />
      </div>
      <div>
        <label for="test-name">Test name</label>
        <input type="text" id="test-name" placeholder="Support line UK" />
      </div>
      <div>
        <label for="test-name-preset">Test name preset</label>
        <div class="input-row">
          <select id="test-name-preset">
            <option value="">Custom</option>
            <option value="support">Support line check</option>
            <option value="sales">Sales line check</option>
            <option value="after_hours">After-hours voicemail check</option>
            <option value="emergency">Emergency callback check</option>
          </select>
          <button type="button" class="btn btn-secondary" id="apply-test-name-preset">Use</button>
        </div>
      </div>
      <div>
        <label for="expected-outcome">Expected outcome</label>
        <input type="text" id="expected-outcome" placeholder="should ring" />
      </div>
      <div>
        <label for="expected-outcome-template">Expected outcome template</label>
        <div class="input-row">
          <select id="expected-outcome-template">
            <option value="">Custom</option>
            <option value="should_ring">Should ring</option>
            <option value="should_answer">Should answer</option>
            <option value="should_go_to_voicemail">Should go to voicemail</option>
            <option value="should_be_busy">Should be busy</option>
            <option value="should_fail">Should fail</option>
          </select>
          <button type="button" class="btn btn-secondary" id="apply-expected-outcome-template">Use</button>
        </div>
      </div>
      <div class="form-span">
        <label for="phone-notes">Notes</label>
        <textarea id="phone-notes" rows="2" placeholder="Optional context"></textarea>
      </div>
    </div>
    <button type="submit" class="btn btn-primary">Run phone test</button>
  </form>
  <div id="phone-results">
    ${emptyStateHtml({
      icon: '📞',
      title: 'Ready for dialler integration',
      message: 'Configure TWILIO_* in .env and run npm run dev:api for live calls.'
    })}
  </div>
`;

export const bindPhoneTests = (root) => {
  const form = root.querySelector('#phone-check-form');
  const results = root.querySelector('#phone-results');
  const testNameInput = root.querySelector('#test-name');
  const testNamePreset = root.querySelector('#test-name-preset');
  const expectedOutcomeInput = root.querySelector('#expected-outcome');
  const expectedTemplate = root.querySelector('#expected-outcome-template');
  const applyTestPresetButton = root.querySelector('#apply-test-name-preset');
  const applyExpectedTemplateButton = root.querySelector('#apply-expected-outcome-template');

  const applyTestPreset = () => {
    const value = TEST_NAME_PRESETS[testNamePreset?.value];
    if (value && testNameInput) testNameInput.value = value;
  };

  const applyExpectedTemplate = () => {
    const value = EXPECTED_OUTCOME_TEMPLATES[expectedTemplate?.value];
    if (value && expectedOutcomeInput) expectedOutcomeInput.value = value;
  };

  applyTestPresetButton?.addEventListener('click', applyTestPreset);
  applyExpectedTemplateButton?.addEventListener('click', applyExpectedTemplate);
  testNamePreset?.addEventListener('change', applyTestPreset);
  expectedTemplate?.addEventListener('change', applyExpectedTemplate);

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const phoneNumber = root.querySelector('#phone-number').value.trim();
    if (!E164_REGEX.test(phoneNumber)) {
      results.innerHTML = `<div class="alert alert-error">Phone number must use E.164 format (e.g. +441234567890).</div>`;
      return;
    }
    results.innerHTML = loadingHtml('Placing test call…');
    try {
      const data = await runPhoneTest({
        phoneNumber,
        testName: testNameInput?.value.trim(),
        expectedOutcome: expectedOutcomeInput?.value.trim(),
        notes: root.querySelector('#phone-notes').value.trim()
      });
      saveHistoryEntry({
        testType: 'phone',
        target: phoneNumber,
        summary: {
          pass: data.status === 'pass' ? 1 : 0,
          fail: data.status === 'fail' ? 1 : 0,
          warn: data.status === 'warn' ? 1 : 0
        }
      });
      const safeStatus = escapeHtml(data.status || 'warn');
      const safeCarrier = escapeHtml(data.carrier || '—');
      const safeLineType = escapeHtml(data.lineType || '—');
      const safeNotes = escapeHtml(data.notes || '—');
      const safeRaw = escapeHtml(JSON.stringify(data.raw || {}, null, 2));
      const safeTitle = escapeHtml(testNameInput?.value.trim() || 'Phone test');
      const safePhone = escapeHtml(phoneNumber);
      results.innerHTML = `
        <article class="result-card">
          <header class="result-card-header">
            <div>
              <h3>${safeTitle}</h3>
              <p class="result-sub">${safePhone}</p>
            </div>
            ${badgeHtml(data.status || 'warn')}
          </header>
          <table class="data-table compact">
            <tbody>
              <tr><td>Status</td><td>${badgeHtml(data.status || 'info', safeStatus)}</td></tr>
              <tr><td>Carrier</td><td>${safeCarrier}</td></tr>
              <tr><td>Line type</td><td>${safeLineType}</td></tr>
              <tr><td>Notes</td><td>${safeNotes}</td></tr>
              <tr><td>Raw</td><td><pre>${safeRaw}</pre></td></tr>
            </tbody>
          </table>
        </article>`;
    } catch (err) {
      results.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
    }
  });
};
