'use strict';
const BACKEND = (process.env.BACKEND || 'supabase').toLowerCase();
const backends = {
  supabase:   () => require('./supabase'),
  databricks: () => require('./databricks'),
};
if (!backends[BACKEND]) throw new Error(`Unknown BACKEND "${BACKEND}". Valid options: ${Object.keys(backends).join(', ')}`);
module.exports = backends[BACKEND]();
