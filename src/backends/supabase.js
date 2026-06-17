'use strict';
const { createClient } = require('@supabase/supabase-js');
let client = null;
function getClient() {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
  client = createClient(url, key);
  return client;
}
async function executeSQL(sql) {
  const sb = getClient();
  const start = Date.now();
  try {
    const match = sql.match(/FROM\s+(\w+)/i);
    const table = match ? match[1] : null;
    if (!table) throw new Error('Could not parse table name from SQL');
    const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
    const limit = limitMatch ? parseInt(limitMatch[1]) : 100;
    const { data, error } = await sb.from(table).select('*').limit(limit);
    if (error) throw new Error(error.message);
    return { ok: true, rows: data || [], rowCount: (data || []).length, durationMs: Date.now() - start };
  } catch (err) {
    return { ok: false, error: err.message, rows: [], rowCount: 0, durationMs: Date.now() - start };
  }
}
module.exports = { executeSQL };
