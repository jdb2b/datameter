'use strict';
require('dotenv').config();
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
  const server = new McpServer({ name: 'mcp-govern', version: '0.1.0' });
  server.tool('execute_sql', 'Execute a SQL query against the configured data warehouse. Returns a statement_id — poll with poll_sql_result.',
    { sql: z.string().describe('SQL query to execute'), warehouse_id: z.string().optional().describe('Warehouse ID (Databricks only)') },
    async ({ sql }) => {
      const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      setImmediate(async () => {
        try {
          const result = await backend.executeSQL(sql);
          const cost = await logQuery({ toolName: 'execute_sql', sqlText: sql, durationMs: result.durationMs, rowsReturned: result.rowCount, error: result.ok ? null : result.error });
          pendingResults.set(jobId, { status: result.ok ? 'SUCCEEDED' : 'FAILED', data: result.ok ? result.rows : null, error: result.ok ? null : result.error, row_count: result.rowCount, duration_ms: result.durationMs, estimated_cost_usd: cost });
        } catch (err) {
          await logQuery({ toolName: 'execute_sql', sqlText: sql, error: err.message }).catch(() => {});
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
      res.end(JSON.stringify({ status: 'ok', service: 'mcp-govern', backend: process.env.BACKEND || 'supabase', log_backend: process.env.LOG_BACKEND || 'file' }));
      return;
    }
    if (!req.url.startsWith('/mcp') && req.url !== '/') { res.writeHead(404); res.end('Not found'); return; }
    if (!checkAuth(req)) { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
    const body = await bodyOf(req);
    const mcpServer = createMcpServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => transport.close());
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, body);
  });
  httpServer.listen(PORT, () => {
    console.log(`mcp-govern running\n  Endpoint: http://localhost:${PORT}/mcp\n  Health:   http://localhost:${PORT}/health\n  Backend:  ${process.env.BACKEND || 'supabase'}\n  Logs:     ${process.env.LOG_BACKEND || 'file'}\n  Auth:     ${WEBHOOK_SECRET ? 'enabled' : 'disabled'}`);
  });
}
main().catch(err => { console.error('Fatal:', err); process.exit(1); });
