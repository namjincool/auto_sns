# Security notes — mono flow local pilot

This repository is a local-development foundation, not a production deployment.

## Controls included

- Passwords are processed with Node `scrypt` and a unique random salt. Plain passwords are never stored.
- Sessions are random, server-side hashes; cookies are `HttpOnly`, `SameSite=Strict`, path-scoped, and gain `Secure` in production mode.
- State-changing API requests require the configured exact `Origin`. Inputs are bounded and validated, JSON bodies are capped at 32 KB, and in-memory per-route rate limits are applied.
- The browser never receives provider keys. `.env` and `.local-data/` are ignored by Git.
- Local draft generation has no network code. A draft must be explicitly approved before it can be scheduled.
- The worker has no SNS client and no default adapter. Due jobs remain blocked instead of publishing.

## Do before a real deployment

1. Replace JSON storage with a managed database, migrations, encryption-at-rest, backups, audit retention, and a secret manager.
2. Put the API behind TLS, set `NODE_ENV=production`, use a real CSRF strategy suited to the deployed domain, and add account recovery/MFA/session revocation.
3. Implement each social provider as a separately reviewed least-privilege adapter. Store OAuth refresh tokens encrypted server-side; never accept them through this UI.
4. Add authorization roles, observability, dependency scanning, security headers, abuse controls, incident response and an independent security review.
5. Treat campaign text as untrusted. Do not interpolate it into model system instructions, shell commands, URLs, or HTML. Validate structured fields and keep secrets out of model context.

## Reporting / recovery

For a local test, stop the API and remove only `.local-data/data.json` if you intentionally want to reset pilot data. Back it up first if it contains work you want to keep. Do not put real customer or OAuth credentials in the local pilot.
