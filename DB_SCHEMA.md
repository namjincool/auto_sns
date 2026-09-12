# Local development data schema

`.local-data/data.json` is a file-backed development store with restrictive write mode. It is deliberately unsuitable for concurrent or production use.

| Collection | Key fields | Security / lifecycle |
| --- | --- | --- |
| `users` | `id`, `email`, `passwordHash`, `createdAt` | `passwordHash` is `salt:scryptHash`; no plaintext password. |
| `sessions` | `userId`, `tokenHash`, `expiresAt` | Raw session token exists only in HttpOnly cookie; expired sessions are ignored. |
| `campaigns` | `userId`, `title`, `product`, `audience`, `story` | Every read/write is ownership-scoped. |
| `drafts` | `campaignId`, `status`, `content`, `approvedAt` | `DRAFT` must become `APPROVED` before scheduling. |
| `schedules` | `draftId`, `scheduledFor`, `status`, `lastError` | Starts `PENDING_CONFIGURATION`; never contains provider tokens. |
| `events` | `type`, `userId`, `meta`, `at` | Small operational counters, not third-party analytics. |

Backup path for the local pilot: copy `.local-data/data.json` while the API is stopped. Restore only into the same trusted local environment. Production requires a transactional database and tested encrypted backup/restore process.
