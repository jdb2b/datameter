# Deploying Datameter

## 1. Fork the repo

Fork [github.com/jdb2b/datameter](https://github.com/jdb2b/datameter) into LeadIQ's GitLab. Deploying from your own fork means the running code is fully under your control — you can audit changes, pin to a specific commit, and merge upstream updates on your own schedule.

---

## 2. Deploy to Coolify

**Create the service**

- New service → Docker Compose
- Source: your GitLab fork
- Branch: `main`

**Set the domain**

- Domain: `YOUR_DOMAIN` (e.g. `datameter.leadiq.com`)
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

Retrieve these values from 1Password before deploying:

| Variable | Where to find it |
|---|---|
| `DATABRICKS_HOST` | 1Password — Datameter / Databricks Host |
| `DATABRICKS_TOKEN` | 1Password — Datameter / Databricks Token |
| `DATABRICKS_WAREHOUSE_ID` | 1Password — Datameter / Databricks Warehouse ID |
| `WEBHOOK_SECRET` | 1Password — Datameter / Webhook Secret |

If `WEBHOOK_SECRET` hasn't been generated yet, create one:

```bash
openssl rand -hex 32
```

Store the output in 1Password before using it.

---

## 4. Claude.ai connector

Connecting Datameter to Claude.ai requires configuring a custom MCP connector in the org's Claude.ai admin settings. This step is handled by the org admin and does not require DevOps involvement.

---

## 5. Verify

```bash
curl https://YOUR_DOMAIN/health
```

Confirm the response includes `"status":"ok"`. If it doesn't, check the container logs in Coolify.
