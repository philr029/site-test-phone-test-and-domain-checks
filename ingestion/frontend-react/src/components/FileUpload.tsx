import { useCallback, useRef, useState, type DragEvent } from 'react';
import { MAX_FILE_SIZE, PREVIEW_ROW_LIMIT, type ParsedFile } from '../types';
import { useParserWorker } from '../hooks/useParserWorker';

export interface FileUploadProps {
  onParsed: (data: ParsedFile) => void;
  onError: (error: Error) => void;
}

export const FileUpload = ({ onParsed, onError }: FileUploadProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const { parseFile, progress, parsing } = useParserWorker();

  const handleFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      onError(new Error(`File exceeds ${MAX_FILE_SIZE / (1024 * 1024)} MB`));
      return;
    }
    try {
      const parsed = await parseFile(file, PREVIEW_ROW_LIMIT);
      onParsed(parsed);
    } catch (err) {
      onError(err instanceof Error ? err : new Error(String(err)));
    }
  }, [onError, onParsed, parseFile]);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    void handleFile(e.dataTransfer.files[0]);
  };

  return (
    <div
      className={`ingest-upload-zone${dragOver ? ' dragover' : ''}${parsing ? ' processing' : ''}`}
      role="region"
      aria-label="File upload"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        hidden
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
      <p>
        Drop <strong>.csv</strong> or <strong>.xlsx</strong> here, or{' '}
        <button type="button" className="link-btn" onClick={() => inputRef.current?.click()}>
          browse
        </button>
      </p>
      {parsing && (
        <div
          className="progress-bar"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  );
};
