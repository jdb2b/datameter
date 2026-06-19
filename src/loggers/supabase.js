'use strict';
const { createClient } = require('@supabase/supabase-js');
const { buildEntry, formatReport } = require('./utils');
let client = null;
function getClient() {
  if (client) return client;
  const url = process.env.SUPABASE_LOG_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_LOG_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_LOG_URL and SUPABASE_LOG_KEY must be set for Supabase logging');
  client = createClient(url, key);
  return client;
}
async function logQuery(params) {
  const entry = buildEntry(params);
  const sb    = getClient();
  await sb.from('query_logs').insert({
    timestamp: entry.timestamp, tool_name: entry.tool_name, sql_text: entry.sql_text,
    duration_ms: entry.duration_ms, rows_returned: entry.rows_returned, join_count: entry.join_count,
    has_limit: entry.has_limit, has_group_by: entry.has_group_by, estimated_cost: entry.estimated_cost, error: entry.error, user: entry.user,
  });
  return entry.estimated_cost;
}
async function getReport({ period = 'week' } = {}) {
  const sb      = getClient();
  const cutoffs = { today: 1, week: 7, month: 30 };
  const days    = cutoffs[period] || 7;
  const since   = new Date(Date.now() - days * 86400 * 1000).toISOString();
  const { data, error } = await sb.from('query_logs').select('*').gte('timestamp', since).order('timestamp', { ascending: false });
  if (error) return `## Query cost report\n\nError fetching logs: ${error.message}`;
  return formatReport(data || [], period);
}
module.exports = { logQuery, getReport };
