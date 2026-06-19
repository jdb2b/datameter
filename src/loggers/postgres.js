'use strict';
const { Pool } = require('pg');
const { buildEntry, formatReport } = require('./utils');
let pool = null;
function getPool() {
  if (pool) return pool;
  const connectionString = process.env.POSTGRES_LOG_URL;
  if (!connectionString) throw new Error('POSTGRES_LOG_URL must be set for Postgres logging');
  pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  return pool;
}
async function ensureTable() {
  const client = await getPool().connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS query_logs (
      id SERIAL PRIMARY KEY, timestamp TIMESTAMPTZ NOT NULL, tool_name TEXT NOT NULL,
      sql_text TEXT, duration_ms INTEGER, rows_returned INTEGER, join_count INTEGER,
      has_limit BOOLEAN, has_group_by BOOLEAN, estimated_cost NUMERIC(10,6), error TEXT, user TEXT)`);
  } finally { client.release(); }
}
async function logQuery(params) {
  const entry = buildEntry(params);
  await ensureTable();
  const client = await getPool().connect();
  try {
    await client.query(
      `INSERT INTO query_logs (timestamp,tool_name,sql_text,duration_ms,rows_returned,join_count,has_limit,has_group_by,estimated_cost,error,user) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [entry.timestamp,entry.tool_name,entry.sql_text,entry.duration_ms,entry.rows_returned,entry.join_count,entry.has_limit,entry.has_group_by,entry.estimated_cost,entry.error,entry.user]
    );
  } finally { client.release(); }
  return entry.estimated_cost;
}
async function getReport({ period = 'week' } = {}) {
  await ensureTable();
  const cutoffs = { today: 1, week: 7, month: 30 };
  const days = cutoffs[period] || 7;
  const since = new Date(Date.now() - days * 86400 * 1000).toISOString();
  const client = await getPool().connect();
  try {
    const { rows } = await client.query('SELECT * FROM query_logs WHERE timestamp >= $1 ORDER BY timestamp DESC', [since]);
    return formatReport(rows, period);
  } finally { client.release(); }
}
module.exports = { logQuery, getReport };
