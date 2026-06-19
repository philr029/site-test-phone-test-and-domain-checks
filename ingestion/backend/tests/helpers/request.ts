import http from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { IncomingHttpHeaders } from 'node:http';
import app from '../../src/app.js';

let server: Server | null = null;
let baseUrl = '';

export const startTestServer = () =>
  new Promise<void>((resolve, reject) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const addr = server!.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
    server.on('error', reject);
  });

export const stopTestServer = () =>
  new Promise<void>((resolve) => {
    if (!server) {
      resolve();
      return;
    }
    server.close(() => {
      server = null;
      resolve();
    });
  });

type JsonBody = Record<string, unknown> | unknown[] | null;

export const request = async (
  method: string,
  path: string,
  body: JsonBody = null,
  headers: IncomingHttpHeaders = {}
): Promise<{ status: number; body: Record<string, unknown> }> => {
  if (!baseUrl) throw new Error('Test server not started');

  const init: RequestInit = { method, headers: { ...headers } };
  if (body != null) {
    init.headers = { 'Content-Type': 'application/json', ...headers };
    init.body = JSON.stringify(body);
  }

  const res = await fetch(`${baseUrl}${path}`, init);
  const text = await res.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text };
  }

  return { status: res.status, body: parsed };
};
