import { runPhoneTest } from '../services/phone-client.js';
import { saveHistoryEntry } from '../storage.js';
import { loadingHtml, emptyStateHtml } from '../components/loading.js';
import { badgeHtml } from '../components/badges.js';

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
        <label for="expected-outcome">Expected outcome</label>
        <input type="text" id="expected-outcome" placeholder="should ring" />
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

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    results.innerHTML = loadingHtml('Placing test call…');
    try {
      const data = await runPhoneTest({
        phoneNumber: root.querySelector('#phone-number').value,
        testName: root.querySelector('#test-name').value,
        expectedOutcome: root.querySelector('#expected-outcome').value,
        notes: root.querySelector('#phone-notes').value
      });
      saveHistoryEntry({
        testType: 'phone',
        target: data.phoneNumber,
        summary: { pass: data.status === 'pass' ? 1 : 0, fail: data.status === 'fail' ? 1 : 0, warn: data.status === 'warn' ? 1 : 0 }
      });
      results.innerHTML = `
        <article class="result-card">
          <header class="result-card-header">
            <div>
              <h3>${data.testName || 'Phone test'}</h3>
              <p class="result-sub">${data.phoneNumber} · ${data.mode} mode</p>
            </div>
            ${badgeHtml(data.status || 'warn')}
          </header>
          <table class="data-table compact">
            <tbody>
              <tr><td>Call status</td><td>${badgeHtml(data.status || 'info', data.callStatus)}</td></tr>
              <tr><td>Expected</td><td>${data.expectedOutcome || '—'}</td></tr>
              <tr><td>Notes</td><td>${data.notes || '—'}</td></tr>
              <tr><td>Detail</td><td>${data.detail || '—'}</td></tr>
            </tbody>
          </table>
        </article>`;
    } catch (err) {
      results.innerHTML = `<div class="alert alert-error">${err.message}</div>`;
    }
  });
};
