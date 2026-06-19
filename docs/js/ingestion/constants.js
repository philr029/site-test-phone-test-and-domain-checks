/** API field definitions and mapping presets for ingestion */

export const API_FIELDS = ['email', 'domain', 'phone', 'url', 'company', 'ip'];

export const API_FIELD_LABELS = {
  email: 'Email',
  domain: 'Domain',
  phone: 'Phone',
  url: 'Website URL',
  company: 'Company',
  ip: 'IP address'
};

/** Preset mappings keyed by name */
export const MAPPING_PRESETS = {
  'domain-check': {
    label: 'Domain & IP checks',
    mapping: { domain: 'domain', ip: 'ip', company: 'company' }
  },
  'phone-check': {
    label: 'Phone tests',
    mapping: { phone: 'phone', company: 'company' }
  },
  'multi-check': {
    label: 'Full QA (domain + phone + site)',
    mapping: { email: 'email', domain: 'domain', phone: 'phone', url: 'url', company: 'company' }
  }
};

export const PREVIEW_ROW_LIMIT = 50;
export const MAX_FILE_SIZE = 50 * 1024 * 1024;
export const SUPPORTED_EXTENSIONS = ['csv', 'xlsx', 'xls'];

export const INGEST_API_BASE = () => {
  if (typeof window !== 'undefined' && window.INGEST_API_BASE) return window.INGEST_API_BASE;
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem('ingest-api-base');
    if (stored) return stored;
  }
  return 'http://127.0.0.1:3850';
};
