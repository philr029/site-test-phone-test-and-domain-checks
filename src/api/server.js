/**
 * Local dashboard API — keeps secrets in .env, never exposed to the browser.
 * Run: npm run dev:api
 */
import http from 'node:http';
import { URL } from 'node:url';
import dotenv from 'dotenv';
import { runTargetCheck } from '../lib/domain-checks.js';
import { runSiteChecks } from '../lib/site-checks.js';
import { runPhoneTest, getPhoneConfigStatus } from '../lib/phone-checks.js';

dotenv.config();

const PORT = Number(process.env.DASHBOARD_API_PORT || 3847);
const HOST = process.env.DASHBOARD_API_HOST || '127.0.0.1';

const json = (res, status, body) => {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(body));
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 2_000_000) reject(new Error('Payload too large'));
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });

const routes = {
  'GET /api/health': async (_req, res) => {
    json(res, 200, {
      ok: true,
      services: {
        twilio: getPhoneConfigStatus(),
        mxtoolbox: Boolean(process.env.MXTOOLBOX_API_KEY),
        abuseIpdb: Boolean(process.env.ABUSEIPDB_API_KEY),
        virusTotal: Boolean(process.env.VIRUSTOTAL_API_KEY)
      }
    });
  },

  'POST /api/domain/check': async (req, res) => {
    const body = await readBody(req);
    const target = body.target || body.domain || body.ip;
    if (!target) {
      json(res, 400, { error: 'target (domain or IP) is required' });
      return;
    }
    const result = await runTargetCheck(target);
    json(res, 200, result);
  },

  'POST /api/site/check': async (req, res) => {
    const body = await readBody(req);
    const url = body.url;
    if (!url) {
      json(res, 400, { error: 'url is required' });
      return;
    }
    const result = await runSiteChecks(url);
    json(res, 200, result);
  },

  'POST /api/phone/test': async (req, res) => {
    const body = await readBody(req);
    const phoneNumber = body.phoneNumber || body.number;
    if (!phoneNumber) {
      json(res, 400, { error: 'phoneNumber is required' });
      return;
    }
    const result = await runPhoneTest({
      phoneNumber,
      testName: body.testName,
      expectedOutcome: body.expectedOutcome,
      notes: body.notes
    });
    json(res, 200, result);
  }
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    json(res, 204, {});
    return;
  }

  const key = `${req.method} ${new URL(req.url, `http://${HOST}`).pathname}`;
  const handler = routes[key];

  if (!handler) {
    json(res, 404, { error: 'Not found' });
    return;
  }

  try {
    await handler(req, res);
  } catch (error) {
    json(res, 500, { error: error.message || 'Internal server error' });
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `\nPort ${PORT} is already in use. Either:\n` +
        `  1. Stop the other process: lsof -i :${PORT} then kill <PID>\n` +
        `  2. Use another port: DASHBOARD_API_PORT=3848 npm run dev:api\n`
    );
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, HOST, () => {
  console.log(`Dashboard API listening at http://${HOST}:${PORT}`);
});
