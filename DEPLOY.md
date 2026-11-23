# FixIT — Deployment guide (single app)

The Express API serves the built React frontend, so you deploy **one Node service + one MySQL database**.
Local development is unchanged: run `npm run dev` in `FixIT/` and `fixit-backend/` separately.

## How it fits together
- `FixIT/.env.production` sets `VITE_API_URL=/api`, so the built frontend calls the API on the same domain.
- `fixit-backend/src/server.js` serves `FixIT/dist` if it exists, with a fallback to `index.html` for React Router.
  If `dist` is missing (dev) it behaves as an API-only server.
- Uploads are stored on disk in `fixit-backend/uploads/` → needs a **persistent volume** in production.
- Technician certificates (`uploads/certificados`) are **not** publicly served; admins download them via the authenticated API.

## Environment variables (backend)
| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV` | yes | `production` |
| `DB_HOST` `DB_PORT` `DB_NAME` `DB_USER` `DB_PASSWORD` | yes | Use a dedicated DB user, not `root` |
| `DB_SSL` | if provider requires TLS | `true` |
| `JWT_SECRET` | yes | 32+ random chars; the app refuses to start in production otherwise |
| `JWT_EXPIRES_IN` | no | default `2h` |
| `PORT` | no | most hosts set it for you |
| `TRUST_PROXY` | no | default `1` in production (right for Render/Railway/Fly/Nginx) |
| `FRONTEND_URL` | only for split deploys | comma-separated origins, no trailing `/` |
| `AUTH_RATE_LIMIT_MAX` | no | login/register attempts per IP per 15 min, default 30 |

Generate a secret: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

## Option A — Docker (recommended)
```bash
docker build -t fixit .
docker run -p 3000:3000 --env-file fixit-backend/.env \
  -v fixit_uploads:/app/fixit-backend/uploads fixit
```
On a PaaS, point the service at the repo root `Dockerfile`, add the env vars, and mount a persistent
disk/volume at `/app/fixit-backend/uploads`. Health check path: `/health`.

## Option B — Plain Node host (no Docker)
Repo root as the working directory:
- **Build:** `cd FixIT && npm ci && npm run build && cd ../fixit-backend && npm ci --omit=dev`
- **Start:** `cd fixit-backend && npm start` (must run from `fixit-backend/` so `uploads/` resolves correctly)
- Node 22 (Vite 8 needs 20.19+ / 22.12+). Attach a persistent disk at `fixit-backend/uploads`.

## Database
1. Create an empty database (`fixit`, utf8mb4) on MySQL 8.
2. Import `fixit-backend/DB/fixit.sql` (it does not create the database itself).
3. Read the checklist below **before** going live: the dump contains test data and no admin user.

## After deploying
- `GET /health` → `{"ok":true,...,"database":"connected"}`
- Open the site, refresh on a deep link (e.g. `/login`) → should load the app, not a 404.
- Register a user, upload an avatar, restart the service, confirm the avatar is still there (volume works).
- `GET /uploads/certificados/anything` → 404 (private).

## Checklist — things that need you (not done in the code)
1. **Rotate secrets.** The original `fixit-backend/.env` was in the zip. Treat its DB password / JWT secret as exposed; create new ones. (The `.env` files are not included in the updated zip.)
2. **Provision MySQL** and a non-root DB user with rights only on `fixit`; enable TLS (`DB_SSL=true`) if it's remote.
3. **Clean the seed data before import.** `fixit.sql` contains 9 users (real-looking emails/DNIs, demo technicians with the known password `DemoFixIT2026!`, `usuario@fixit.com` / `12345678`) plus incidencias, citas and triage results. Keep the catalog tables (`categorias_problema`, `distritos`, `especialidades`, `modalidades_servicio`, `opciones_triaje`, `preguntas_triaje`, `tipos_equipo`); remove or replace the rest unless you want a demo.
4. **Create an admin user.** The dump has no `ADMIN`. Register normally, then run: `UPDATE usuarios SET rol='ADMIN' WHERE correo='you@example.com';` (use a strong password).
5. **Hosting:** create the service, set env vars, attach the persistent volume for `uploads/`, add your domain (HTTPS is handled by the host).
6. **Backups:** schedule DB backups and back up the uploads volume.
7. **Test the Docker build / npm build yourself once.** They were written but not executed in the environment where these changes were made (no network access).
8. **Password recovery is not implemented.** The frontend calls `POST /api/auth/recuperar-password`, which doesn't exist in the backend, and the UI shows a success message anyway. Needs an email provider (SMTP/Resend/SES) + reset-token flow, or hide the page until then.

## Optional follow-ups
- Move uploads to object storage (S3/R2) so you can run more than one instance; replace the in-memory rate limiter (`middleware/rateLimit.js`) with a shared store at the same time.
- Multer file-filter errors (e.g. wrong image type) come back as HTTP 500; set `err.status = 400` in the filters for cleaner responses.
- The `VITE_API_URL` fallback logic is repeated in ~11 frontend files; consider using the single helper in `services/api.js`.
- JWTs are kept in `localStorage`; httpOnly cookies are safer against XSS but need backend + frontend changes.
- Incident photos (`/uploads/incidencias`) and avatars are public by URL; make them authenticated if photos are sensitive.
- Add `"engines": {"node": ">=20.19"}` to both `package.json` files (left out so the lockfiles aren't touched).
