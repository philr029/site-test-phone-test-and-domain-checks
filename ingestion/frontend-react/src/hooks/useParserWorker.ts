import { useCallback, useRef, useState } from 'react';
import type { ParsedFile } from '../types';

const workerCode = `
importScripts(
  'https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js',
  'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js'
);
self.onmessage = async (e) => {
  const { fileType, content, fileName, previewLimit } = e.data;
  try {
    let headers = [], previewRows = [], totalRows = 0;
    if (fileType === 'csv') {
      await new Promise((resolve, reject) => {
        Papa.parse(content, {
          header: false, skipEmptyLines: 'greedy',
          step: (r) => {
            if (!headers.length) { headers = r.data.map(String); return; }
            if (previewRows.length < previewLimit) {
              previewRows.push(headers.map((_, i) => String(r.data[i] ?? '')));
            }
            totalRows++;
          },
          complete: resolve, error: (err) => reject(new Error(err.message))
        });
      });
    } else {
      const wb = XLSX.read(content, { type: 'array' });
      const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
      headers = data[0].map(String);
      const all = data.slice(1).map((row) => headers.map((_, i) => String(row[i] ?? '')));
      previewRows = all.slice(0, previewLimit);
      totalRows = all.length;
    }
    self.postMessage({ ok: true, payload: { fileName, headers, previewRows, totalRows } });
  } catch (err) {
    self.postMessage({ ok: false, error: err.message });
  }
};
`;

/** React hook wrapping a classic Web Worker for file parsing */
export const useParserWorker = () => {
  const workerRef = useRef<Worker | null>(null);
  const [progress, setProgress] = useState(0);
  const [parsing, setParsing] = useState(false);

  const parseFile = useCallback((file: File, previewLimit = 50): Promise<ParsedFile> => {
    setParsing(true);
    setProgress(5);

    return new Promise((resolve, reject) => {
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      const worker = new Worker(url);
      workerRef.current = worker;

      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      const reader = new FileReader();

      reader.onload = () => {
        setProgress(30);
        worker.onmessage = (e) => {
          URL.revokeObjectURL(url);
          worker.terminate();
          workerRef.current = null;
          setParsing(false);
          setProgress(100);
          if (e.data.ok) resolve(e.data.payload);
          else reject(new Error(e.data.error));
        };
        worker.postMessage({
          fileType: ext === 'csv' ? 'csv' : 'xlsx',
          content: reader.result,
          fileName: file.name,
          previewLimit
        });
      };

      reader.onerror = () => {
        URL.revokeObjectURL(url);
        worker.terminate();
        setParsing(false);
        reject(new Error('Failed to read file'));
      };

      if (ext === 'csv') reader.readAsText(file);
      else reader.readAsArrayBuffer(file);
    });
  }, []);

  const cancel = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    setParsing(false);
  }, []);

  return { parseFile, progress, parsing, cancel };
};
