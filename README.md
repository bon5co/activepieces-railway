# activepieces-railway

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/activepieces-or-just-updated-zapier-alte?referralCode=Z1xivh&utm_medium=integration&utm_source=template&utm_campaign=generic)

**Deploy on Railway:** [Activepieces template](https://railway.com/deploy/activepieces-or-just-updated-zapier-alte?referralCode=Z1xivh&utm_medium=integration&utm_source=template&utm_campaign=generic)

Wrapper image for deploying [Activepieces](https://github.com/activepieces/activepieces)
(open-source Zapier/Make alternative) on Railway.

Base image: `activepieces/activepieces:0.82.0`.

## What this adds

1. **The instance is claimed before the public port opens.** Stock Activepieces
   answers `POST /api/v1/authentication/sign-up` for the very first caller and gives
   that account `platformRole: ADMIN`, regardless of `AP_SIGN_UP_ENABLED` — the flag
   only takes effect once a platform exists. On a public Railway URL that means the
   first stranger to find the domain owns the instance, and the deployer's own attempt
   afterwards returns `403 INVITATION_ONLY_SIGN_UP`. The community edition exposes no
   password-reset route (`/api/v1/authn/local/reset-password` and `/api/v1/otp` are
   both `404`), so there is no recovery.

   This entrypoint boots Activepieces on an internal port that Railway's edge does not
   route, creates the administrator from `AP_ADMIN_EMAIL` / `AP_ADMIN_PASSWORD`, stops
   that process, and only then starts the real server on `$PORT`.

2. **The credential is re-applied on every boot**, so a redeploy is a working password
   reset — the only recovery path a fresh deploy has.

3. **It refuses to boot** on an empty email, an empty password, or a password shorter
   than 8 characters, rather than starting an unclaimed instance.

4. `AP_PORT` is derived from Railway's injected `PORT`, and `AP_FRONTEND_URL` from
   `RAILWAY_PUBLIC_DOMAIN` when it is not set explicitly.

## Variables

| Name | Required | Notes |
| --- | --- | --- |
| `AP_ADMIN_EMAIL` | yes | administrator account |
| `AP_ADMIN_PASSWORD` | yes | at least 8 characters; re-applied every boot |
| `AP_ENCRYPTION_KEY` | yes | 32 characters |
| `AP_JWT_SECRET` | yes | |
| `AP_POSTGRES_*` | yes | host, port, username, password, database |
| `AP_REDIS_URL` | yes | |
| `AP_FRONTEND_URL` | no | defaults to `https://$RAILWAY_PUBLIC_DOMAIN` |
