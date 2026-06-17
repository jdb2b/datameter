'use strict';
const fs   = require('fs');
const path = require('path');
const { buildEntry, formatReport } = require('./utils');
const LOG_PATH = path.join(__dirname, '..', '..', 'data', 'queries.log');
function ensureDir() { fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true }); }
async function logQuery(params) {
  const entry = buildEntry(params);
  ensureDir();
  fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n');
  return entry.estimated_cost;
}
async function getReport({ period = 'week' } = {}) {
  if (!fs.existsSync(LOG_PATH)) return '## Query cost report\n\nNo queries logged yet.';
  const cutoffs = { today: 1, week: 7, month: 30 };
  const days    = cutoffs[period] || 7;
  const since   = new Date(Date.now() - days * 86400 * 1000).toISOString();
  const entries = fs.readFileSync(LOG_PATH, 'utf8')
    .split('\n').filter(Boolean)
    .map(line => { try { return JSON.parse(line); } catch { return null; } })
    .filter(e => e && e.timestamp >= since);
  return formatReport(entries, period);
}
module.exports = { logQuery, getReport };
