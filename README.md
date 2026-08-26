# The Bag Hub ERP

Monorepo: NestJS API in `backend/`, Vite + React SPA in `frontend/`.

Staging on Heroku:

| App | Heroku app name | URL |
| --- | --- | --- |
| Frontend | `tbh-erp-stg-fe` | https://tbh-erp-stg-fe-b638851771d5.herokuapp.com |
| Backend | `tbh-erp-stg-be` | https://tbh-erp-stg-be-c3a53e81fff4.herokuapp.com |

## Local development

Do **not** set `DATABASE_URL`, `VITE_API_URL`, or `VITE_SOCKET_URL` in local `.env` files. Those are Heroku-only.

1. Copy `backend/.env.example` to `backend/.env` and fill local values (`DB_*` points at your machine Postgres).
2. `cd backend && npm install && npm run build && npm run migration:run` (creates tables on a new local DB; no-op if the baseline is already recorded).
3. Terminal 1: `cd backend && npm run start:dev` (port 3000).
4. Terminal 2: `cd frontend && npm install && npm run dev` (port 5173). Vite proxies `/api` and `/socket.io` to the backend.

## After you change code

Heroku only builds **committed** files on the branch you push. Uncommitted work will not deploy.

### 1. Commit

```powershell
git add <files>
git commit -m "Describe why this change exists"
```

### 2. Push to staging

From the **repo root**, on `main` (or `git push <remote> HEAD:main` from another branch).

| What you changed | Command |
| --- | --- |
| Backend only (`backend/`) | `git push heroku-be main` |
| Frontend only (`frontend/`) | `git push heroku-fe main` |
| Both, or shared types/contracts | Push **backend first**, then frontend |

```powershell
git push heroku-be main
git push heroku-fe main
```

First-time remotes (if missing):

```powershell
heroku git:remote -a tbh-erp-stg-be -r heroku-be
heroku git:remote -a tbh-erp-stg-fe -r heroku-fe
```

You must be logged in (`heroku login`). Builds use the subdirectory buildpack (`PROJECT_PATH=backend` / `frontend`).

### 3. Confirm the release

```powershell
heroku logs --tail -a tbh-erp-stg-be
heroku logs --tail -a tbh-erp-stg-fe
```

Smoke-check:

- Backend: https://tbh-erp-stg-be-c3a53e81fff4.herokuapp.com/api
- Frontend: open the SPA URL and sign in. Network requests for `/api` should go to the **backend** host, not the frontend host.

## Config vars (only when env changes)

App config is **not** in git. Change it with `heroku config:set`, not by editing local `.env`.

**Frontend `VITE_*` vars are baked in at build time.** After changing `VITE_API_URL`, `VITE_SOCKET_URL`, or `VITE_TURNSTILE_SITE_KEY`, you must **rebuild** the frontend (`git push heroku-fe main`, or an empty commit if there is no code change).

```powershell
heroku config:set VITE_API_URL=https://tbh-erp-stg-be-c3a53e81fff4.herokuapp.com -a tbh-erp-stg-fe
git commit --allow-empty -m "Rebuild frontend to pick up VITE_* config"
git push heroku-fe main
```

Backend vars (`FRONTEND_ORIGIN`, `JWT_SECRET`, mail, AWS, Shopify, Stream) take effect on the next dyno restart. `heroku config:set` already restarts the backend.

Do **not** set `DB_HOST` / `DB_PASSWORD` on Heroku. The Postgres addon provides `DATABASE_URL`. Do **not** set `TYPEORM_SYNCHRONIZE`.

## Database

Staging Postgres is attached to **tbh-erp-stg-be** only (`heroku-postgresql:essential-0`). The frontend never connects to the database.

Schema changes go through TypeORM migrations. `synchronize` is off in every environment.

### After you change entities

From `backend/`:

```powershell
npm run migration:generate -- src/database/migrations/DescriptiveName
```

Review the generated SQL, then commit and `git push heroku-be main`. The Heroku **release** phase runs `npm run migration:run` before the web dyno starts.

After pulling migration files locally (existing DB that already has tables only needs this once for the baseline; new empty DBs run them for real):

```powershell
cd backend
npm run build
npm run migration:run
```

See pending vs applied:

```powershell
cd backend
npm run build
npm run migration:show
```
