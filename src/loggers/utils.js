'use strict';
function analyzeSql(sql) {
  if (!sql || typeof sql !== 'string') return { joinCount: 0, hasLimit: false, hasGroupBy: false };
  const upper = sql.toUpperCase();
  return {
    joinCount: (upper.match(/\bJOIN\b/g) || []).length,
    hasLimit:   /\bLIMIT\b/.test(upper),
    hasGroupBy: /\bGROUP\s+BY\b/.test(upper),
  };
}
function estimateCost({ durationMs, rowsReturned, joinCount, hasLimit, hasGroupBy }) {
  const BASE_RATE   = 0.05;
  const seconds     = (durationMs || 0) / 1000;
  const joinMult    = 1 + (joinCount || 0) * 0.4;
  const rowFactor   = Math.log10(Math.max(rowsReturned || 1, 1) + 1) * 0.3 + 1;
  const limitDisc   = hasLimit   ? 0.6 : 1.0;
  const groupByMult = hasGroupBy ? 1.2 : 1.0;
  const cost = BASE_RATE * Math.max(seconds, 0.05) * joinMult * rowFactor * limitDisc * groupByMult;
  return Math.round(cost * 10000) / 10000;
}
function buildEntry({ toolName, sqlText, durationMs, rowsReturned, error, user }) {
  const { joinCount, hasLimit, hasGroupBy } = analyzeSql(sqlText);
  const estimatedCostUsd = error ? 0 : estimateCost({ durationMs, rowsReturned, joinCount, hasLimit, hasGroupBy });
  return {
    timestamp:      new Date().toISOString(),
    tool_name:      toolName,
    sql_text:       sqlText || null,
    duration_ms:    durationMs || null,
    rows_returned:  rowsReturned || null,
    join_count:     joinCount,
    has_limit:      hasLimit,
    has_group_by:   hasGroupBy,
    estimated_cost: estimatedCostUsd,
    error:          error || null,
    user:           user || null,
  };
}
function hourLabel(h) {
  if (h === 0)  return '12am';
  if (h < 12)   return `${h}am`;
  if (h === 12) return '12pm';
  return `${h - 12}pm`;
}
function extractTables(sql) {
  if (!sql) return [];
  const tables = [];
  const re = /\b(?:FROM|JOIN)\s+([\w.]+)/gi;
  let m;
  while ((m = re.exec(sql)) !== null) tables.push(m[1].toLowerCase());
  return tables;
}
function formatReport(entries, period) {
  const successful = entries.filter(e => !e.error);
  const total      = successful.reduce((s, e) => s + (e.estimated_cost || 0), 0);
  const avg        = successful.length ? total / successful.length : 0;
  const max        = successful.length ? Math.max(...successful.map(e => e.estimated_cost || 0)) : 0;
  const avgDur     = successful.length ? successful.reduce((s, e) => s + (e.duration_ms || 0), 0) / successful.length : 0;
  const top5 = [...successful].sort((a, b) => (b.estimated_cost || 0) - (a.estimated_cost || 0)).slice(0, 5);
  const sqlCounts = {};
  successful.forEach(e => { if (e.sql_text) sqlCounts[e.sql_text] = (sqlCounts[e.sql_text] || 0) + 1; });
  const cache = Object.entries(sqlCounts).filter(([, count]) => count >= 2).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const lines = [
    `## Query cost report — last ${period}`,
    ``,
    `**Total queries:** ${successful.length}`,
    `**Total estimated cost:** $${total.toFixed(4)}`,
    `**Average cost per query:** $${avg.toFixed(4)}`,
    `**Most expensive query:** $${max.toFixed(4)}`,
    `**Average duration:** ${Math.round(avgDur)}ms`,
    ``,
    `### Top 5 most expensive queries`,
  ];
  if (!top5.length) {
    lines.push('No queries logged yet.');
  } else {
    top5.forEach((q, i) => {
      lines.push(`**${i + 1}.** \`${(q.sql_text || '').slice(0, 80)}...\``);
      const userTag = q.user ? ` · User: ${q.user}` : '';
      lines.push(`   Cost: $${(q.estimated_cost || 0).toFixed(4)} · Duration: ${q.duration_ms}ms · Rows: ${q.rows_returned}${userTag} · ${q.timestamp}`);
    });
  }
  lines.push('', '### Cache candidates (run 2+ times)');
  if (!cache.length) {
    lines.push('No repeated queries yet.');
  } else {
    cache.forEach(([sql, count]) => {
      const totalCost = successful.filter(e => e.sql_text === sql).reduce((s, e) => s + (e.estimated_cost || 0), 0);
      const priority  = count >= 5 ? ' 🔴 HIGH PRIORITY' : '';
      lines.push(`- Run **${count}×** · Estimated savings: $${totalCost.toFixed(4)}${priority}`);
      lines.push(`  \`${sql.slice(0, 80)}\``);
    });
  }
  // Cost by hour of day
  const hourMap = {};
  successful.forEach(e => {
    if (!e.timestamp) return;
    const h = new Date(e.timestamp).getHours();
    if (!hourMap[h]) hourMap[h] = { cost: 0, count: 0 };
    hourMap[h].cost  += e.estimated_cost || 0;
    hourMap[h].count += 1;
  });
  const topHours = Object.entries(hourMap).sort((a, b) => b[1].cost - a[1].cost).slice(0, 5);
  lines.push('', '### Cost by hour of day (top 5)');
  if (!topHours.length) {
    lines.push('No data yet.');
  } else {
    topHours.forEach(([h, { cost, count }]) => {
      lines.push(`- **${hourLabel(Number(h))}** — $${cost.toFixed(4)} (${count} quer${count === 1 ? 'y' : 'ies'})`);
    });
  }
  // Most expensive tables
  const tableMap = {};
  successful.forEach(e => {
    extractTables(e.sql_text).forEach(t => {
      if (!tableMap[t]) tableMap[t] = { cost: 0, count: 0 };
      tableMap[t].cost  += e.estimated_cost || 0;
      tableMap[t].count += 1;
    });
  });
  const topTables = Object.entries(tableMap).sort((a, b) => b[1].cost - a[1].cost).slice(0, 5);
  lines.push('', '### Most expensive tables (top 5)');
  if (!topTables.length) {
    lines.push('No table references found.');
  } else {
    topTables.forEach(([table, { cost, count }]) => {
      lines.push(`- **${table}** — $${cost.toFixed(4)} (${count} quer${count === 1 ? 'y' : 'ies'})`);
    });
  }
  // Cost by user
  const userMap = {};
  successful.forEach(e => {
    const u = e.user || '(unknown)';
    if (!userMap[u]) userMap[u] = { cost: 0, count: 0 };
    userMap[u].cost  += e.estimated_cost || 0;
    userMap[u].count += 1;
  });
  const topUsers = Object.entries(userMap).sort((a, b) => b[1].cost - a[1].cost).slice(0, 5);
  lines.push('', '### Cost by user (top 5)');
  if (!topUsers.length) {
    lines.push('No data yet.');
  } else {
    topUsers.forEach(([u, { cost, count }]) => {
      lines.push(`- **${u}** — $${cost.toFixed(4)} (${count} quer${count === 1 ? 'y' : 'ies'})`);
    });
  }
  return lines.join('\n');
}
module.exports = { buildEntry, formatReport, estimateCost, analyzeSql };
