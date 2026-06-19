/** Shared constants for the spreadsheet engine */

export const COLUMN_ALIASES = {
  domain: ['domain', 'domains', 'hostname', 'host', 'domain name', 'domain_name'],
  ip: ['ip', 'ips', 'ip address', 'ipaddress', 'ip_address'],
  website: ['website', 'site', 'web'],
  url: ['url', 'link', 'uri', 'website url', 'website_url'],
  company: ['company', 'name', 'organisation', 'organization', 'org', 'client'],
  phone: ['phone', 'phones', 'phone number', 'phonenumber', 'phone_number', 'mobile', 'tel'],
  email: ['email', 'emails', 'e-mail', 'mail']
};

export const VALIDATION_TYPES = {
  email: 'email',
  domain: 'domain',
  ip: 'ip',
  phone: 'phone',
  url: 'url',
  numeric: 'numeric',
  boolean: 'boolean',
  text: 'text'
};

export const VALIDATION_TYPE_LABELS = {
  auto: 'Auto-detect',
  [VALIDATION_TYPES.email]: 'Email',
  [VALIDATION_TYPES.domain]: 'Domain',
  [VALIDATION_TYPES.ip]: 'IP address',
  [VALIDATION_TYPES.phone]: 'Phone number',
  [VALIDATION_TYPES.url]: 'URL',
  [VALIDATION_TYPES.numeric]: 'Numeric',
  [VALIDATION_TYPES.boolean]: 'Boolean',
  [VALIDATION_TYPES.text]: 'Text'
};

export const CHECK_TYPES = {
  domain: 'domain',
  phone: 'phone',
  site: 'site'
};

export const CHECK_TYPE_LABELS = {
  domain: 'Domain & IP checks',
  phone: 'Phone tests',
  site: 'Site tests'
};

export const MAX_ROWS = 50000;
export const WORKER_THRESHOLD = 500;
export const DEFAULT_PAGE_SIZE = 50;
export const VIRTUAL_ROW_HEIGHT = 36;

export const normalizeHeader = (h) => String(h ?? '').trim().toLowerCase();
