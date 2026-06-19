# Deploying Datameter

## 1. Fork the repo

Fork [github.com/jdb2b/datameter](https://github.com/jdb2b/datameter) into your own Git host (GitHub, GitLab, etc.). Deploying from your own fork means the running code is fully under your control — you can audit changes, pin to a specific commit, and merge upstream updates on your own schedule.

---

## 2. Deploy to Coolify

**Create the service**

- New service → Docker Compose
- Source: your fork
- Branch: `main`

**Set the domain**

- Domain: `YOUR_DOMAIN` (e.g. `datameter.yourcompany.com`)
- Enable HTTPS

**Add environment variables**

```
BACKEND=databricks
DATABRICKS_HOST=
DATABRICKS_TOKEN=
DATABRICKS_WAREHOUSE_ID=
LOG_BACKEND=databricks
DATABRICKS_LOG_CATALOG=governance
DATABRICKS_LOG_SCHEMA=datameter
DATABRICKS_LOG_TABLE=query_logs
WEBHOOK_SECRET=
HOST=https://YOUR_DOMAIN
PORT=3000
```

See section 3 for where to get the credential values.

**Deploy**

Hit Deploy. Once the container is up, verify:

```bash
curl https://YOUR_DOMAIN/health
```

Expected response: `{"status":"ok",...}`

---

## 3. Credentials

These four values must be kept secret. Store them in your team's secrets manager before deploying.

| Variable | Description |
|---|---|
| `DATABRICKS_HOST` | Workspace URL from your Databricks admin |
| `DATABRICKS_TOKEN` | Personal access token with SQL warehouse access |
| `DATABRICKS_WAREHOUSE_ID` | ID of the SQL warehouse to run queries against |
| `WEBHOOK_SECRET` | A randomly generated string — see below |

Generate `WEBHOOK_SECRET`:

```bash
openssl rand -hex 32
```

Store the output in your secrets manager before use.

---

## 4. Claude.ai connector

Connecting Datameter to Claude.ai requires configuring a custom MCP connector in the org's Claude.ai admin settings. This step is handled by the org admin and does not require DevOps involvement.

---

## 5. Verify

```bash
curl https://YOUR_DOMAIN/health
```

Confirm the response includes `"status":"ok"`. If it doesn't, check the container logs in Coolify.
