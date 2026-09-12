# Service runbook — local pilot

## Start

Use two terminals in the project folder:

```powershell
# terminal 1 — safe local API and worker
$env:DEV_LOCAL_AI='true'
npm run api

# terminal 2 — browser UI
npm run dev
```

Open the Vite URL shown in terminal 2 (normally `http://127.0.0.1:5173`). The API listens only on `127.0.0.1:8787`; Vite proxies `/api` to it.

`DEV_LOCAL_AI=true` enables a deterministic local template only. It does not contact OpenAI or any other AI service. With it unset, generation deliberately returns `ai_configuration_required`.

## Safe operating flow

1. Create a local account (password minimum is 10 characters).
2. Create a campaign using reviewed facts only.
3. Generate a local draft, check it, then choose **사람 검토 완료 · 승인**.
4. Select a future time and register the schedule.
5. Expect `PENDING_CONFIGURATION` or `BLOCKED_ADAPTER`: the included worker does not publish externally.

## Health and test

```powershell
Invoke-RestMethod http://127.0.0.1:8787/api/health
npm run test:api
npm run build
```

## Failure handling

- UI says API unavailable: start `npm run api`, then refresh the Vite page.
- Generation says configuration required: set `DEV_LOCAL_AI=true` only for local test and restart API.
- A due job is `BLOCKED_ADAPTER`: this is expected safety behavior; no post was sent.
- To preserve local work, back up `.local-data/data.json` while the API is stopped. Do not use this recovery method for a deployed service.

## Required work before external release

Provider OAuth app registration, approved scopes, encrypted token storage, per-provider API policy review, a real job queue, database, RBAC, TLS, observability, legal/privacy review, load testing, threat modeling, backups and incident response are all required. No provider is assumed or configured here.
