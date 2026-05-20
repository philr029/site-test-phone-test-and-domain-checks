import { API_BASE, setApiBase } from '../config.js';
import { getSettings, saveSettings } from '../storage.js';

export const renderSettings = (apiHealth) => `
  <section class="page-header">
    <div>
      <p class="page-eyebrow">Configuration</p>
      <h1>Settings</h1>
      <p class="page-desc">API endpoint and environment — secrets belong in <code>.env</code> on the server only.</p>
    </div>
  </section>
  <article class="panel-card">
    <h2>API connection</h2>
    <form id="settings-form" class="check-form">
      <label for="api-base">Local API base URL</label>
      <input type="url" id="api-base" value="${API_BASE}" />
      <p class="hint">Run <code>npm run dev:api</code> (default port 3847). GitHub Pages uses browser mock mode when API is unreachable.</p>
      <button type="submit" class="btn btn-primary">Save &amp; reload</button>
    </form>
    <h3>Service status</h3>
    <ul class="status-list">
      <li>API: ${apiHealth ? '✓ Connected' : '✗ Offline (mock mode)'}</li>
      <li>Twilio: ${apiHealth?.services?.twilio?.twilioConfigured ? 'Configured' : 'Mock'}</li>
      <li>MXToolbox: ${apiHealth?.services?.mxtoolbox ? 'Yes' : 'DNS fallback'}</li>
      <li>AbuseIPDB: ${apiHealth?.services?.abuseIpdb ? 'Yes' : 'Placeholder'}</li>
      <li>VirusTotal: ${apiHealth?.services?.virusTotal ? 'Yes' : 'Placeholder'}</li>
    </ul>
  </article>
  <article class="panel-card">
    <h2>CLI automation (unchanged)</h2>
    <pre><code>npm run test:e2e
npm run test:form-popup
npm run test:phone
npm run test:domain</code></pre>
    <p class="hint">Playwright and Twilio scripts in <code>src/</code> remain the source of truth for scheduled CI runs.</p>
  </article>
`;

export const bindSettings = (root) => {
  root.querySelector('#settings-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    setApiBase(root.querySelector('#api-base').value.trim());
  });
};
