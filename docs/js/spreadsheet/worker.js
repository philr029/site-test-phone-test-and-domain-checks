/**
 * Web worker for heavy CSV parsing and dataset validation.
 */
import { parseCsv, parseSpreadsheet } from './parser.js';
import { validateDataset } from './validation.js';

self.onmessage = async (e) => {
  const { type, payload } = e.data;

  try {
    if (type === 'process') {
      const parsed = await parseSpreadsheet({
        type: payload.fileType,
        content: payload.content,
        fileName: payload.fileName
      });
      const validated = validateDataset(parsed, payload.columnRules ?? {});
      self.postMessage({ result: validated });
      return;
    }

    if (type === 'validate') {
      const validated = validateDataset(payload.parsed, payload.columnRules ?? {});
      self.postMessage({ result: validated });
      return;
    }

    if (type === 'parseCsv') {
      const parsed = parseCsv(payload.text);
      self.postMessage({ result: parsed });
      return;
    }

    self.postMessage({ error: `Unknown worker message type: ${type}` });
  } catch (err) {
    self.postMessage({ error: err.message || String(err) });
  }
};
