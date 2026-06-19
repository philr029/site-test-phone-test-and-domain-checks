export const API_FIELDS = ['email', 'domain', 'phone', 'url', 'company', 'ip'] as const;
export type ApiField = (typeof API_FIELDS)[number];

export const API_FIELD_LABELS: Record<ApiField, string> = {
  email: 'Email',
  domain: 'Domain',
  phone: 'Phone',
  url: 'Website URL',
  company: 'Company',
  ip: 'IP address'
};

export const PREVIEW_ROW_LIMIT = 50;
export const MAX_FILE_SIZE = 50 * 1024 * 1024;

export interface ParsedFile {
  fileName: string;
  headers: string[];
  previewRows: string[][];
  totalRows: number;
}

export type ColumnMapping = Record<string, ApiField | ''>;
