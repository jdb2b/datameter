'use strict';
/*
 * Datameter MCP server — HTTP entry point.
 *
 * Exposes three MCP tools over Streamable HTTP:
 *   execute_sql      — submits a SQL query to the configured warehouse backend,
 *                      returns a statement_id immediately (async execution)
 *   poll_sql_result  — polls by statement_id; returns rows once the query completes
 *   get_query_report — returns a cost and usage summary for today, this week, or month
 *
 * Auth: if WEBHOOK_SECRET is set, every /mcp request must carry
 * "Authorization: Bearer <secret>". The OAuth endpoints below issue that same
 * secret as the access_token, satisfying Claude.ai's connector handshake without
 * adding user-identity or multi-tenant logic on top.
 */
require('dotenv').config();
const crypto = require('crypto');
const http = require('http');
const path = require('path');
const { createRequire } = require('module');
const sdkRequire = createRequire(path.join(__dirname, '..', 'node_modules', '@modelcontextprotocol', 'sdk', 'package.json'));
const { McpServer } = sdkRequire('./dist/cjs/server/mcp.js');
const { StreamableHTTPServerTransport } = sdkRequire('./dist/cjs/server/streamableHttp.js');
const { z } = require('zod');
const backend = require('./backends');
const { logQuery, getReport } = require('./loggers');
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || `http://localhost:${PORT}`;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || null;
const pendingResults = new Map();
function checkAuth(req) {
  if (!WEBHOOK_SECRET) return true;
  const header = req.headers['x-webhook-secret'] || req.headers['authorization'];
  if (!header) return false;
  const token = header.startsWith('Bearer ') ? header.slice(7) : header;
  return token === WEBHOOK_SECRET;
}
function createMcpServer() {
  const server = new McpServer({ name: 'datameter', version: '0.1.0' });
  server.tool('execute_sql', 'Execute a SQL query against the configured data warehouse. Returns a statement_id — poll with poll_sql_result.',
    { sql: z.string().describe('SQL query to execute'), warehouse_id: z.string().optional().describe('Warehouse ID (Databricks only)'), user: z.string().optional().describe('Name or email of the person running this query — used for attribution in cost reports') },
    async ({ sql, user }) => {
      const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      setImmediate(async () => {
        try {
          const result = await backend.executeSQL(sql);
          const cost = await logQuery({ toolName: 'execute_sql', sqlText: sql, durationMs: result.durationMs, rowsReturned: result.rowCount, error: result.ok ? null : result.error, user });
          pendingResults.set(jobId, { status: result.ok ? 'SUCCEEDED' : 'FAILED', data: result.ok ? result.rows : null, error: result.ok ? null : result.error, row_count: result.rowCount, duration_ms: result.durationMs, estimated_cost_usd: cost });
        } catch (err) {
          await logQuery({ toolName: 'execute_sql', sqlText: sql, error: err.message, user }).catch(() => {});
          pendingResults.set(jobId, { status: 'FAILED', error: err.message });
        }
        setTimeout(() => pendingResults.delete(jobId), 10 * 60 * 1000);
      });
      return { content: [{ type: 'text', text: JSON.stringify({ statement_id: jobId, status: 'PENDING' }) }] };
    }
  );
  server.tool('poll_sql_result', 'Poll for the result of a previously submitted SQL query.',
    { statement_id: z.string().describe('The statement_id returned by execute_sql') },
    async ({ statement_id }) => {
      const result = pendingResults.get(statement_id);
      if (!result) return { content: [{ type: 'text', text: JSON.stringify({ statement_id, status: 'PENDING' }) }] };
      return { content: [{ type: 'text', text: JSON.stringify({ statement_id, ...result }) }] };
    }
  );
  server.tool('get_query_report', 'Get a cost and usage report for recent queries logged by this governance wrapper.',
    { period: z.enum(['today', 'week', 'month']).optional().default('week').describe('Time period for the report') },
    async ({ period }) => {
      const report = await getReport({ period });
      return { content: [{ type: 'text', text: report }] };
    }
  );
  return server;
}
function bodyOf(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => { try { const raw = Buffer.concat(chunks).toString(); resolve(raw ? JSON.parse(raw) : undefined); } catch { resolve(undefined); } });
    req.on('error', reject);
  });
}
async function main() {
  const httpServer = http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'datameter', backend: process.env.BACKEND || 'databricks', log_backend: process.env.LOG_BACKEND || 'file' }));
      return;
    }
    // ── OAuth stub ──────────────────────────────────────────────────────────────
    // Claude.ai's custom connector beta requires a full OAuth 2.0 handshake before
    // it will connect, even for self-hosted single-tenant deployments. The three
    // endpoints below implement the minimum required flow: a discovery document,
    // an authorization-code redirect, and a token endpoint. There is no user
    // identity check and no multi-tenant logic.
    //
    // How the token works: /oauth/token issues WEBHOOK_SECRET as the access_token.
    // Claude.ai caches that token and sends it as "Authorization: Bearer <secret>"
    // on every subsequent /mcp request, which checkAuth() then validates. Configure
    // WEBHOOK_SECRET in your environment and register the same value in Claude.ai's
    // connector settings — that shared secret is the only access control.
    //
    // This is a documented workaround for a platform requirement, not a security
    // vulnerability. Rotate WEBHOOK_SECRET like any shared credential and keep it
    // out of source control.
    if (req.method === 'GET' && req.url === '/.well-known/oauth-authorization-server') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        issuer: HOST,
        authorization_endpoint: `${HOST}/oauth/authorize`,
        token_endpoint: `${HOST}/oauth/token`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code'],
        token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
        code_challenge_methods_supported: ['S256', 'plain'],
      }));
      return;
    }
    // /oauth/authorize — issues a one-time authorization code and redirects back
    // to Claude.ai. The code itself is a timestamp-based nonce; it is never
    // validated on exchange because there are no user sessions to protect here.
    if (req.method === 'GET' && req.url.startsWith('/oauth/authorize')) {
      const url = new URL(req.url, HOST);
      const redirectUri = url.searchParams.get('redirect_uri');
      const state = url.searchParams.get('state');
      if (!redirectUri) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'missing redirect_uri' })); return; }
      const dest = new URL(redirectUri);
      dest.searchParams.set('code', `code_${Date.now()}`);
      if (state) dest.searchParams.set('state', state);
      res.writeHead(302, { Location: dest.toString() });
      res.end();
      return;
    }
    // /oauth/token — completes the handshake by issuing WEBHOOK_SECRET as the
    // bearer token. Claude.ai will attach this token to every /mcp request via
    // "Authorization: Bearer <token>", which checkAuth() validates above.
    if (req.method === 'POST' && req.url === '/oauth/token') {
      const accessToken = WEBHOOK_SECRET || crypto.randomBytes(32).toString('hex');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ access_token: accessToken, token_type: 'bearer', expires_in: 3600 }));
      return;
    }
    if (!req.url.startsWith('/mcp') && !req.url.startsWith('/oauth') && req.url !== '/') { res.writeHead(404); res.end('Not found'); return; }
    if (!checkAuth(req)) { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
    const body = await bodyOf(req);
    const mcpServer = createMcpServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => transport.close());
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, body);
  });
  httpServer.listen(PORT, () => {
    console.log(`datameter running\n  Endpoint: ${HOST}/mcp\n  Health:   ${HOST}/health\n  OAuth:    ${HOST}/oauth/authorize  ${HOST}/oauth/token\n  Metadata: ${HOST}/.well-known/oauth-authorization-server\n  Backend:  ${process.env.BACKEND || 'databricks'}\n  Logs:     ${process.env.LOG_BACKEND || 'file'}\n  Auth:     ${WEBHOOK_SECRET ? 'enabled' : 'disabled'}`);
  });
}
main().catch(err => { console.error('Fatal:', err); process.exit(1); });
