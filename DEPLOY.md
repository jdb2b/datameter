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
LOG_BACKEND=file
WEBHOOK_SECRET=
HOST=https://YOUR_DOMAIN
PORT=3000
```

`LOG_BACKEND=file` is recommended for the initial install. It writes query logs to `./data/queries.log` inside the container so you can confirm queries are flowing through before introducing a second Databricks dependency. Switch to `LOG_BACKEND=databricks` once verified (see step 6).

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

---

## 6. Switch to Databricks logging

Once you've confirmed queries are flowing through (run a query via Claude and check `./data/queries.log` in the container), update the environment variables in Coolify to write logs to Unity Catalog instead:

```
LOG_BACKEND=databricks
DATABRICKS_LOG_CATALOG=governance
DATABRICKS_LOG_SCHEMA=datameter
DATABRICKS_LOG_TABLE=query_logs
```

Redeploy. Subsequent queries will be appended to the Delta table at `governance.datameter.query_logs`.

---

## 7. Staying up to date

Datameter is under active development. To receive updates from the upstream repo after your initial fork:

**1. Add the upstream remote (one time only):**

```bash
git remote add upstream https://github.com/jdb2b/datameter.git
```

**2. When you want to pull in new features:**

```bash
git fetch upstream
git merge upstream/main
git push origin main
```

Then redeploy in Coolify. If you have auto-deploy enabled on your fork, Coolify will pick up the changes automatically after the push.
