'use strict';
const BACKEND = (process.env.BACKEND || 'databricks').toLowerCase();
if (BACKEND === 'supabase') throw new Error('Supabase backend is for local development only. Set BACKEND=databricks.');
if (BACKEND !== 'databricks') throw new Error(`Unknown BACKEND "${BACKEND}". Valid options: databricks`);
module.exports = require('./databricks');
