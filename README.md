# mcp-govern

mcp-govern is a self-hosted MCP server that sits between Claude and your data warehouse. When Claude runs a SQL query, it goes through mcp-govern first — the query is logged, costs are tracked, and results are returned. It gives your team visibility into what AI-generated queries are running, how often, and at what cost, without changing how Claude or your warehouse is configured.

Best suited for teams running Databricks, Snowflake, or BigQuery as their primary warehouse.

---

## How it works

```
Claude (claude.ai)
      │  MCP over HTTPS
      ▼
 mcp-govern                ← logs every query, tracks cost
      │
      ├── Supabase ────────► Postgres warehouse
      └── Databricks ──────► Databricks SQL warehouse
```

Claude connects via the MCP protocol. mcp-govern executes the query against your warehouse, logs the result, and returns rows to Claude. Nothing else touches the query.

---

## Quick start (Coolify + Docker)

**1. Clone the repo**

```bash
git clone https://github.com/jdb2b/mcp-govern.git
cd mcp-govern
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
- Set the domain (e.g. `mcp.yourcompany.com`) and enable HTTPS
- Deploy

**4. Connect Claude**

In Claude.ai → Settings → Integrations → Add custom connector:

- MCP endpoint: `https://mcp.yourcompany.com/mcp`
- OAuth authorization URL: `https://mcp.yourcompany.com/oauth/authorize`
- OAuth token URL: `https://mcp.yourcompany.com/oauth/token`
- If `WEBHOOK_SECRET` is set, the OAuth flow will issue it as the bearer token automatically

**5. Verify**

```bash
curl https://mcp.yourcompany.com/health
```

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `BACKEND` | Yes | Query execution backend: `supabase` or `databricks` |
| `SUPABASE_URL` | Supabase | Your project URL (`https://xyz.supabase.co`) |
| `SUPABASE_SERVICE_KEY` | Supabase | Service role key (not the anon key) |
| `SUPABASE_DB_URL` | Recommended | Direct Postgres connection string — required for arbitrary SQL including COUNT queries. Format: `postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres` |
| `DATABRICKS_HOST` | Databricks | Workspace URL (`https://your-workspace.azuredatabricks.net`) |
| `DATABRICKS_TOKEN` | Databricks | Personal access token |
| `DATABRICKS_WAREHOUSE_ID` | Databricks | SQL warehouse ID |
| `LOG_BACKEND` | Yes | Where to write query logs: `file`, `supabase`, `postgres`, or `databricks` |
| `SUPABASE_LOG_URL` | Supabase logging | Defaults to `SUPABASE_URL` if not set |
| `SUPABASE_LOG_KEY` | Supabase logging | Defaults to `SUPABASE_SERVICE_KEY` if not set |
| `POSTGRES_LOG_URL` | Postgres logging | Connection string for a Postgres log table |
| `DATABRICKS_LOG_CATALOG` | Databricks logging | Unity Catalog name |
| `DATABRICKS_LOG_SCHEMA` | Databricks logging | Schema name |
| `DATABRICKS_LOG_TABLE` | Databricks logging | Table name |
| `WEBHOOK_SECRET` | No | If set, all MCP requests must include `Authorization: Bearer <secret>` |
| `HOST` | No | Public base URL of this service (e.g. `https://mcp.yourcompany.com`). Used in OAuth metadata and startup logs. Defaults to `http://localhost:3000` |
| `PORT` | No | Port to listen on. Defaults to `3000` |

---

## MCP tools

Claude sees three tools:

| Tool | Description |
|---|---|
| `execute_sql` | Submits a SQL query for async execution and returns a `statement_id` |
| `poll_sql_result` | Polls by `statement_id` and returns rows once the query completes |
| `get_query_report` | Returns a cost and usage summary for the current day, week, or month |

---

## Supported backends

**Query execution**
- Databricks — uses the Databricks Statement Execution API
- Supabase — uses the direct Postgres connection (`SUPABASE_DB_URL`) for full SQL support, falls back to the REST API if not set. Recommended for development and testing environments only.

**Logging**
- `file` — JSON log written to `./data/queries.log` (persisted via Docker volume)
- `supabase` — inserts into a `query_logs` table in your Supabase project
- `postgres` — inserts into a `query_logs` table via direct connection
- `databricks` — appends to a Delta table in Unity Catalog

---

## Security

mcp-govern is entirely self-hosted. Your warehouse credentials, query text, and results never leave your infrastructure. Set `WEBHOOK_SECRET` to require a shared secret on every request from Claude.

---

## Roadmap
- Snowflake backend
- BigQuery backend
- Cross-customer cost benchmarking
