# Runbook — importing legacy subfrost data into subfrost.io

How to pull data out of the **old subfrost stack** and load it into subfrost.io's
Postgres. Written from the FUEL import (2026-06-21), which is the worked example.

There are **two source shapes**, with **different acquisition paths**:

| Source | Where it lives | Acquisition |
|---|---|---|
| **A. Cloud SQL** (subfrost-app `subfrost-db`) — e.g. `fuel_allocations`, `invite_codes` | bestary project `lithomantic-heaven-bestary`, instance `subfrost-db` | **Server-side export → GCS → download** (this runbook §1). The instance is **PRIVATE-IP-ONLY**, so a local `cloud-sql-proxy` CANNOT reach it. |
| **B. JSON file store** (subfrost-admin) — FinCEN/BSA, MTL, KYC/reviews | a **PVC / MinIO** in the subfrost-admin k8s cluster (`lib/store.ts` singletons/collections via `node:fs`) | **NOT covered here** — needs PVC/MinIO file extraction. Scope this in the FinCEN/AML spec. |

The **target** (subfrost.io `subfrost-postgres`, project `night-wolves-jogging`) is
**PUBLIC**, so a local `cloud-sql-proxy` connects normally for the load (§2).

## Tooling (already on disk, no gcloud needed)

- Token minting: `C:\Alkanes Geral Dev\.ioenv-extracted\gcp_token.py` (RS256 JWT → OAuth2; `SA_KEY=<key.json>`, `SCOPE=...`). **Use the FULL scope** `https://www.googleapis.com/auth/cloud-platform` — the read-only scope is rejected by Secret Manager / Cloud SQL Admin / Cloud Build.
- Proxy: `C:\Alkanes Geral Dev\.ioenv-check\cloud-sql-proxy.exe` (v2, generic — `--credentials-file <key> --port <p> <instance-connection-name>`).
- SA keys: bestary `C:\Alkanes Geral Dev\.bestary-extracted\.config\gcloud-bestary\bestary-sa.json`; io `C:\Alkanes Geral Dev\.ioenv-extracted\.config\gcloud-io\io-sa.json`.
- kubectl: `bash C:\Alkanes Geral Dev\.ioenv-extracted\kubectl-io.sh <args>`.

## §1 — Acquire from Cloud SQL (private-only source: server-side export)

`scripts/dump-fuel-allocations.ts` (local proxy + Prisma) does **not** work against
`subfrost-db` — the proxy reports *"instance does not have IP of type PUBLIC"*. Use
the Cloud SQL Admin API export instead (this is what `gcloud sql export` does
server-side; no client network to the DB is needed):

```bash
cd "C:/Alkanes Geral Dev/.bestary-extracted"
export SA_KEY="C:/Alkanes Geral Dev/.bestary-extracted/.config/gcloud-bestary/bestary-sa.json"
TOKEN=$(SCOPE="https://www.googleapis.com/auth/cloud-platform" python "C:/Alkanes Geral Dev/.ioenv-extracted/gcp_token.py")

# 1. Trigger a CSV export of a SELECT to the existing backups bucket. The instance
#    service account (p484394891132-iljuc3@gcp-sa-cloud-sql...) already has write
#    on gs://bestary-db-backups (proven by the referral exports), so no IAM grant.
TS=$(date -u +%Y%m%d-%H%M%S); URI="gs://bestary-db-backups/fuel-export/<table>-$TS.csv"
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  "https://sqladmin.googleapis.com/v1/projects/lithomantic-heaven-bestary/instances/subfrost-db/export" \
  -d "{\"exportContext\":{\"fileType\":\"CSV\",\"uri\":\"$URI\",\"databases\":[\"subfrost\"],\"csvExportOptions\":{\"selectQuery\":\"SELECT <cols> FROM public.<table> ORDER BY <key>\"}}}"
# → returns an operation name; status PENDING.

# 2. Poll the operation until DONE:
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://sqladmin.googleapis.com/v1/projects/lithomantic-heaven-bestary/operations/<opId>"

# 3. Download the CSV (URL-encode the object path: '/' → %2F):
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://storage.googleapis.com/storage/v1/b/bestary-db-backups/o/fuel-export%2F<table>-$TS.csv?alt=media" \
  -o "C:/Alkanes Geral Dev/.bestary-extracted/dump/<table>.csv"
```

**Cloud SQL CSV note:** no header row; columns in `selectQuery` order; NULL → empty
field. Convert CSV → the JSON snapshot the loader expects (run with Windows
`python`, not the Git-Bash `/tmp` path):

```bash
python -c "
import csv, json
src=r'C:/Alkanes Geral Dev/.bestary-extracted/dump/<table>.csv'
rows=[]
with open(src, newline='', encoding='utf-8') as f:
    for r in csv.reader(f):
        if len(r) < <ncols>: continue
        rows.append({ <map columns by index, '' -> None for nullable, float() for numeric> })
json.dump(rows, open(r'C:/Alkanes Geral Dev/.bestary-extracted/dump/<table>.json','w',encoding='utf-8'), indent=2)
print(len(rows), 'rows')
"
```

Keep both the `.csv` and `.json` in `.bestary-extracted/dump/` — the snapshot is the
durable, inspectable record (and preserves columns the loader doesn't apply, e.g.
source timestamps, for later recovery).

## §2 — Load into subfrost.io (public target: local proxy)

```bash
# Start the proxy for the PUBLIC io instance (connects fine from local):
"C:/Alkanes Geral Dev/.ioenv-check/cloud-sql-proxy.exe" \
  --credentials-file "C:/Alkanes Geral Dev/.ioenv-extracted/.config/gcloud-io/io-sa.json" \
  --port 5432 night-wolves-jogging:us-central1:subfrost-postgres   # run in background

# DATABASE_URL lives in the k8s secret `subfrost-io-secrets` (key DATABASE_URL),
# NOT `db-connection-string-k8s`. Its host is already 127.0.0.1:5432:
cd "C:/Alkanes Geral Dev/subfrost.io"
DBURL=$(bash "C:/Alkanes Geral Dev/.ioenv-extracted/kubectl-io.sh" \
  get secret subfrost-io-secrets -n subfrost -o jsonpath='{.data.DATABASE_URL}' | base64 -d)

npx tsx scripts/migrate-fuel-data.ts --dry-run     # validate the snapshot, no DB
DATABASE_URL="$DBURL" npx tsx scripts/migrate-fuel-data.ts   # real load (idempotent)
```

`npx tsx` works in this environment. Stop the proxy afterward
(`taskkill //IM cloud-sql-proxy.exe //F`).

## Verifying

Quick count/sum check against the target (write the script under the repo so
`node_modules` resolves; `/tmp` does not):

```bash
# .git/sdd/verify.mts: new PrismaClient(); count + aggregate({_sum:{amount:true}})
DATABASE_URL="$DBURL" npx tsx .git/sdd/verify.mts
```

FUEL result (2026-06-21): **1739 rows, sum(amount) = 96612.34**. Also spot-check the
live admin surface (e.g. `/admin/fuel`) — no redeploy is needed, the app reads the
table directly.

## Gotchas (learned the hard way)

- `subfrost-db` is **private-IP-only** → local proxy can't reach it. The error is
  `failed to connect to instance: Config error: instance does not have IP of type "PUBLIC"`.
- `gcp_token.py` read-only scope is **insufficient** for Secret Manager, Cloud SQL
  Admin, and Cloud Build APIs — use the full `cloud-platform` scope.
- Windows `python` resolves `/tmp/...` to `C:\tmp` (not the Git-Bash `/tmp`). Read
  files from an explicit Windows path.
- The legacy DB connection string lives in the **bestary** Secret Manager
  (`DATABASE_URL`); the export does not need it (it runs server-side), but a direct
  client connection would.
