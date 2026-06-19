/**
 * ColumnMapper — map spreadsheet columns to API fields with presets.
 */
import {
  API_FIELDS,
  API_FIELD_LABELS,
  MAPPING_PRESETS
} from './constants.js';
import { normalizeHeader } from '../spreadsheet/constants.js';

/** Suggest mapping from headers using alias detection */
export const suggestMapping = (headers) => {
  const mapping = {};
  const usedFields = new Set();

  headers.forEach((header) => {
    const norm = normalizeHeader(header);
    for (const field of API_FIELDS) {
      if (usedFields.has(field)) continue;
      const aliases = {
        email: ['email', 'e-mail', 'mail'],
        domain: ['domain', 'hostname', 'host'],
        phone: ['phone', 'mobile', 'tel'],
        url: ['url', 'website', 'site', 'link'],
        company: ['company', 'name', 'organisation', 'organization'],
        ip: ['ip', 'ip address', 'ipaddress']
      };
      if (aliases[field]?.some((a) => norm === a || norm.includes(a))) {
        mapping[header] = field;
        usedFields.add(field);
        break;
      }
    }
  });

  return mapping;
};

/**
 * @param {HTMLElement} container
 * @param {{ headers: string[], mapping?: Record<string, string>, onChange: (mapping: Record<string, string>) => void }} options
 */
export const createColumnMapper = (container, options) => {
  const { headers, onChange } = options;
  let mapping = { ...suggestMapping(headers), ...(options.mapping ?? {}) };

  const render = () => {
    const presetOptions = Object.entries(MAPPING_PRESETS)
      .map(([key, preset]) => `<option value="${key}">${preset.label}</option>`)
      .join('');

    const rows = headers.map((header) => {
      const fieldOptions = ['<option value="">— Skip —</option>']
        .concat(API_FIELDS.map((f) =>
          `<option value="${f}"${mapping[header] === f ? ' selected' : ''}>${API_FIELD_LABELS[f]}</option>`
        ))
        .join('');

      return `
        <tr>
          <th scope="row">${escapeHtml(header)}</th>
          <td>
            <label class="visually-hidden" for="map-${slug(header)}">Map ${escapeHtml(header)}</label>
            <select id="map-${slug(header)}" class="ingest-map-select" data-header="${escapeAttr(header)}">
              ${fieldOptions}
            </select>
          </td>
        </tr>
      `;
    }).join('');

    container.innerHTML = `
      <div class="ingest-mapper" role="form" aria-label="Column mapping">
        <div class="ingest-mapper-toolbar">
          <label for="ingest-preset">Preset</label>
          <select id="ingest-preset" class="ingest-preset-select">
            <option value="">Custom</option>
            ${presetOptions}
          </select>
        </div>
        <table class="data-table ingest-map-table">
          <thead>
            <tr><th scope="col">Spreadsheet column</th><th scope="col">API field</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <p class="hint">Map at least one column before uploading. Unmapped columns are ignored.</p>
      </div>
    `;

    container.querySelectorAll('.ingest-map-select').forEach((select) => {
      select.addEventListener('change', () => {
        const header = select.getAttribute('data-header');
        const value = select.value;
        if (!header) return;
        if (value) mapping[header] = value;
        else delete mapping[header];
        onChange({ ...mapping });
      });
    });

    container.querySelector('.ingest-preset-select')?.addEventListener('change', (e) => {
      const key = e.target.value;
      if (!key || !MAPPING_PRESETS[key]) return;
      const preset = MAPPING_PRESETS[key];
      mapping = {};
      for (const header of headers) {
        const norm = normalizeHeader(header);
        for (const [colKey, field] of Object.entries(preset.mapping)) {
          if (norm === colKey || norm.includes(colKey)) {
            mapping[header] = field;
          }
        }
      }
      onChange({ ...mapping });
      render();
    });
  };

  render();

  return {
    getMapping: () => ({ ...mapping }),
    setMapping: (next) => {
      mapping = { ...next };
      render();
    }
  };
};

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-');
const escapeHtml = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (s) => escapeHtml(s).replace(/"/g, '&quot;');
