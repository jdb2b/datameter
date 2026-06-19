'use strict';
const https = require('https');
const { buildEntry, formatReport } = require('./utils');
function getConfig() {
  const host = process.env.DATABRICKS_HOST;
  const token = process.env.DATABRICKS_TOKEN;
  const warehouseId = process.env.DATABRICKS_WAREHOUSE_ID;
  const catalog = process.env.DATABRICKS_LOG_CATALOG || 'governance';
  const schema  = process.env.DATABRICKS_LOG_SCHEMA  || 'mcp_govern';
  const table   = process.env.DATABRICKS_LOG_TABLE   || 'query_logs';
  if (!host || !token || !warehouseId) throw new Error('DATABRICKS_HOST, DATABRICKS_TOKEN, DATABRICKS_WAREHOUSE_ID must be set');
  return { host, token, warehouseId, catalog, schema, table };
}
function sqlRequest(sql, config) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ statement: sql, warehouse_id: config.warehouseId, wait_timeout: '30s' });
    const options = {
      hostname: config.host.replace('https://', ''),
      path: '/api/2.0/sql/statements', method: 'POST',
      headers: { 'Authorization': `Bearer ${config.token}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    };
    const req = https.request(options, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString())); } catch { resolve({}); } });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}
async function logQuery(params) {
  const entry = buildEntry(params);
  const config = getConfig();
  const { catalog, schema, table } = config;
  const esc = v => v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;
  await sqlRequest(`CREATE CATALOG IF NOT EXISTS ${catalog}`, config).catch(() => {});
  await sqlRequest(`CREATE SCHEMA IF NOT EXISTS ${catalog}.${schema}`, config).catch(() => {});
  await sqlRequest(`CREATE TABLE IF NOT EXISTS ${catalog}.${schema}.${table} (timestamp TIMESTAMP, tool_name STRING, sql_text STRING, duration_ms INT, rows_returned INT, join_count INT, has_limit BOOLEAN, has_group_by BOOLEAN, estimated_cost DOUBLE, error STRING, user STRING) USING DELTA`, config).catch(() => {});
  await sqlRequest(`INSERT INTO ${catalog}.${schema}.${table} VALUES (TIMESTAMP '${entry.timestamp}', ${esc(entry.tool_name)}, ${esc(entry.sql_text)}, ${entry.duration_ms ?? 'NULL'}, ${entry.rows_returned ?? 'NULL'}, ${entry.join_count}, ${entry.has_limit}, ${entry.has_group_by}, ${entry.estimated_cost}, ${esc(entry.error)}, ${esc(entry.user)})`, config);
  return entry.estimated_cost;
}
async function getReport({ period = 'week' } = {}) {
  const config = getConfig();
  const cutoffs = { today: 1, week: 7, month: 30 };
  const days = cutoffs[period] || 7;
  const since = new Date(Date.now() - days * 86400 * 1000).toISOString();
  const { catalog, schema, table } = config;
  const res = await sqlRequest(`SELECT * FROM ${catalog}.${schema}.${table} WHERE timestamp >= TIMESTAMP '${since}' ORDER BY timestamp DESC`, config);
  const columns = res.manifest?.schema?.columns?.map(c => c.name) || [];
  const rows = (res.result?.data_array || []).map(row => Object.fromEntries(columns.map((col, i) => [col, row[i]])));
  return formatReport(rows, period);
}
module.exports = { logQuery, getReport };
