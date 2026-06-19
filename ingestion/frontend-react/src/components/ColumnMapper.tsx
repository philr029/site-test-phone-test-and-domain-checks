import { useEffect, useState } from 'react';
import {
  API_FIELDS,
  API_FIELD_LABELS,
  type ApiField,
  type ColumnMapping
} from '../types';

const PRESETS: Record<string, { label: string; mapping: Record<string, ApiField> }> = {
  'domain-check': {
    label: 'Domain & IP checks',
    mapping: { domain: 'domain', ip: 'ip', company: 'company' }
  },
  'phone-check': {
    label: 'Phone tests',
    mapping: { phone: 'phone', company: 'company' }
  },
  'multi-check': {
    label: 'Full QA',
    mapping: { email: 'email', domain: 'domain', phone: 'phone', url: 'url', company: 'company' }
  }
};

const suggestMapping = (headers: string[]): ColumnMapping => {
  const mapping: ColumnMapping = {};
  const aliases: Record<ApiField, string[]> = {
    email: ['email', 'e-mail'],
    domain: ['domain', 'hostname'],
    phone: ['phone', 'mobile'],
    url: ['url', 'website', 'site'],
    company: ['company', 'name', 'organisation'],
    ip: ['ip', 'ip address']
  };

  for (const header of headers) {
    const norm = header.trim().toLowerCase();
    for (const field of API_FIELDS) {
      if (aliases[field].some((a) => norm.includes(a))) {
        mapping[header] = field;
        break;
      }
    }
  }
  return mapping;
};

export interface ColumnMapperProps {
  headers: string[];
  value?: ColumnMapping;
  onChange: (mapping: ColumnMapping) => void;
}

export const ColumnMapper = ({ headers, value, onChange }: ColumnMapperProps) => {
  const [mapping, setMapping] = useState<ColumnMapping>(() => ({
    ...suggestMapping(headers),
    ...value
  }));

  useEffect(() => {
    onChange(mapping);
  }, [mapping, onChange]);

  const applyPreset = (key: string) => {
    const preset = PRESETS[key];
    if (!preset) return;
    const next: ColumnMapping = {};
    for (const header of headers) {
      const norm = header.trim().toLowerCase();
      for (const [colKey, field] of Object.entries(preset.mapping)) {
        if (norm.includes(colKey)) next[header] = field;
      }
    }
    setMapping(next);
  };

  return (
    <div className="ingest-mapper" role="form" aria-label="Column mapping">
      <label htmlFor="preset-select">Preset </label>
      <select id="preset-select" onChange={(e) => applyPreset(e.target.value)} defaultValue="">
        <option value="">Custom</option>
        {Object.entries(PRESETS).map(([key, p]) => (
          <option key={key} value={key}>{p.label}</option>
        ))}
      </select>

      <table className="data-table ingest-map-table">
        <thead>
          <tr>
            <th scope="col">Spreadsheet column</th>
            <th scope="col">API field</th>
          </tr>
        </thead>
        <tbody>
          {headers.map((header) => (
            <tr key={header}>
              <th scope="row">{header}</th>
              <td>
                <select
                  aria-label={`Map ${header}`}
                  value={mapping[header] ?? ''}
                  onChange={(e) => {
                    const field = e.target.value as ApiField | '';
                    setMapping((prev) => {
                      const next = { ...prev };
                      if (field) next[header] = field;
                      else delete next[header];
                      return next;
                    });
                  }}
                >
                  <option value="">— Skip —</option>
                  {API_FIELDS.map((f) => (
                    <option key={f} value={f}>{API_FIELD_LABELS[f]}</option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
