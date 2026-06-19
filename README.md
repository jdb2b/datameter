# Datameter

Datameter is a self-hosted MCP server that sits between Claude and your data warehouse — giving you visibility into what AI-generated queries are running, how often, and at what cost. The data engineer you don't have.

Best suited for teams running Databricks, Snowflake, or BigQuery as their primary warehouse.

---

## How it works

```
Claude (claude.ai)
      │  MCP over HTTPS
      ▼
 Datameter                 ← logs every query, tracks cost
      │
      └── Databricks ──────► Databricks SQL warehouse
```

Claude connects via the MCP protocol. Datameter executes the query against your warehouse, logs the result, and returns rows to Claude. Nothing else touches the query.

---

## Quick start (Coolify + Docker)

**1. Clone the repo**

```bash
git clone https://github.com/jdb2b/datameter.git
cd datameter
```

**2. Create your env file**

```bash
cp .env.example .env
```

Edit `.env` with your values (see table below).

**3. Deploy in Coolify**

- Create a new service → Docker Compose
- Point it at this repo
- Paste your env vars into the Environment section
- Set the domain (e.g. `datameter.yourcompany.com`) and enable HTTPS
- Deploy

**4. Connect Claude**

In Claude.ai → Settings → Integrations → Add custom connector:

- MCP endpoint: `https://datameter.yourcompany.com/mcp`
- OAuth authorization URL: `https://datameter.yourcompany.com/oauth/authorize`
- OAuth token URL: `https://datameter.yourcompany.com/oauth/token`
- If `WEBHOOK_SECRET` is set, the OAuth flow will issue it as the bearer token automatically

**5. Verify**

```bash
curl https://datameter.yourcompany.com/health
```

If anything doesn't work as expected, see [TROUBLESHOOTING.md](./TROUBLESHOOTING.md).

---

## Environment variables

**Query execution**

| Variable | Required | Description |
|---|---|---|
| `BACKEND` | Yes | Query execution backend. Currently: `databricks` |
| `DATABRICKS_HOST` | Yes | Workspace URL (`https://your-workspace.azuredatabricks.net`) |
| `DATABRICKS_TOKEN` | Yes | Personal access token |
| `DATABRICKS_WAREHOUSE_ID` | Yes | SQL warehouse ID |

**Logging**

| Variable | Required | Description |
|---|---|---|
| `LOG_BACKEND` | Yes | Where to write query logs: `databricks`, `postgres`, `supabase`, or `file` |
| `DATABRICKS_LOG_CATALOG` | Databricks logging | Unity Catalog name |
| `DATABRICKS_LOG_SCHEMA` | Databricks logging | Schema name |
| `DATABRICKS_LOG_TABLE` | Databricks logging | Table name |
| `SUPABASE_LOG_URL` | Supabase logging | Supabase project URL for log writes |
| `SUPABASE_LOG_KEY` | Supabase logging | Supabase service role key for log writes |
| `POSTGRES_LOG_URL` | Postgres logging | Connection string for a Postgres log table |

**Security**

| Variable | Required | Description |
|---|---|---|
| `WEBHOOK_SECRET` | No | If set, all MCP requests must include `Authorization: Bearer <secret>` |

**Server**

| Variable | Required | Description |
|---|---|---|
| `HOST` | No | Public base URL of this service (e.g. `https://datameter.yourcompany.com`). Used in OAuth metadata and startup logs. Defaults to `http://localhost:3000` |
| `PORT` | No | Port to listen on. Defaults to `3000` |

---

## MCP tools

Claude sees three tools:

| Tool | Description |
|---|---|
| `execute_sql` | Submits a SQL query for async execution and returns a `statement_id` |
| `poll_sql_result` | Polls by `statement_id` and returns rows once the query completes |
| `get_query_report` | Returns a cost and usage report including summary stats, top queries by cost, cache candidates, cost by hour of day, most expensive tables, and cost by user |

---

## Supported backends

**Query execution**
- Databricks — uses the Databricks Statement Execution API. Snowflake and BigQuery on the roadmap.

**Logging**
- `databricks` — appends to a Delta table in Unity Catalog
- `bigquery` — _(roadmap)_
- `snowflake` — _(roadmap)_
- `postgres` — inserts into a `query_logs` table via direct connection
- `supabase` — inserts into a `query_logs` table in your Supabase project
- `file` — JSON log written to `./data/queries.log` (persisted via Docker volume)

---

## Security

Datameter is entirely self-hosted. Your warehouse credentials, query text, and results never leave your infrastructure. Set `WEBHOOK_SECRET` to require a shared secret on every request from Claude.

---

## Roadmap
- Snowflake backend
- BigQuery backend
- Cross-customer cost benchmarking
