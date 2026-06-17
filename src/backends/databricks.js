'use strict';
const https = require('https');
function getConfig() {
  const host = process.env.DATABRICKS_HOST;
  const token = process.env.DATABRICKS_TOKEN;
  const warehouseId = process.env.DATABRICKS_WAREHOUSE_ID;
  if (!host || !token || !warehouseId) throw new Error('DATABRICKS_HOST, DATABRICKS_TOKEN, and DATABRICKS_WAREHOUSE_ID must be set');
  return { host, token, warehouseId };
}
function apiRequest(method, path, body, config) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: config.host.replace('https://', ''),
      path,
      method,
      headers: {
        'Authorization': `Bearer ${config.token}`,
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };
    const req = https.request(options, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString())); } catch { resolve({}); } });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}
async function executeSQL(sql) {
  const config = getConfig();
  const start = Date.now();
  try {
    const submitRes = await apiRequest('POST', '/api/2.0/sql/statements', { statement: sql, warehouse_id: config.warehouseId, wait_timeout: '30s' }, config);
    if (submitRes.status?.state === 'FAILED') return { ok: false, error: submitRes.status.error?.message || 'Query failed', rows: [], rowCount: 0, durationMs: Date.now() - start };
    const rows = submitRes.result?.data_array || [];
    const columns = submitRes.manifest?.schema?.columns?.map(c => c.name) || [];
    const structured = rows.map(row => Object.fromEntries(columns.map((col, i) => [col, row[i]])));
    return { ok: true, rows: structured, rowCount: structured.length, durationMs: Date.now() - start, statementId: submitRes.statement_id };
  } catch (err) {
    return { ok: false, error: err.message, rows: [], rowCount: 0, durationMs: Date.now() - start };
  }
}
module.exports = { executeSQL };
