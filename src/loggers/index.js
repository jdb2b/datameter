'use strict';
const LOG_BACKEND = (process.env.LOG_BACKEND || 'file').toLowerCase();
const loggers = {
  file:       () => require('./file'),
  supabase:   () => require('./supabase'),
  postgres:   () => require('./postgres'),
  databricks: () => require('./databricks'),
};
if (!loggers[LOG_BACKEND]) throw new Error(`Unknown LOG_BACKEND "${LOG_BACKEND}". Valid options: ${Object.keys(loggers).join(', ')}`);
module.exports = loggers[LOG_BACKEND]();
