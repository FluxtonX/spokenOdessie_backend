# Admin dashboard setup

The separate `spoken-odyssey-admin` app authenticates against credentials configured in the backend environment. **No admin user needs to be registered in the customer app or inserted into the database.** User, family, and post data still come from the existing PostgreSQL database.

## Backend configuration

Set these variables in the backend runtime environment (never in the Next.js public environment):

```env
ADMIN_EMAIL=the-designated-admin-email@example.com
ADMIN_PASSWORD=use-a-long-unique-password
JWT_SECRET=use-a-long-random-secret-value
```

Keep these values only in the backend runtime environment. Do not put the admin password in the admin app's `.env.local`, any `NEXT_PUBLIC_*` variable, or frontend source. The backend compares the password in constant time, and changing it invalidates existing admin tokens. Admin sessions expire after eight hours by default.

## Admin app configuration

Set the backend origin in `spoken-odyssey-admin/.env.local` for local development:

```env
BACKEND_URL=http://localhost:5000
```

The backend defaults to port `5000` (`PORT` can override it), so set this to the port printed by the backend terminal. `BACKEND_URL` is server-only. The Next.js app stores the returned JWT in an HttpOnly, SameSite=Strict cookie and proxies admin API calls through its own route handlers. In production, the cookie is Secure.

## Endpoints

- `POST /api/admin/auth/login`
- `GET /api/admin/auth/me`
- `GET /api/admin/dashboard?period=30d|12m`
- `GET /api/admin/users?page=1&limit=25&search=&family=all|joined|none&sort=recent|oldest|name|active`
- `GET /api/admin/users/:id`
- `GET /api/admin/families?page=1&limit=25&search=&sort=recent|oldest|name|members`
- `GET /api/admin/families/:id`
- `GET /api/admin/content?page=1&limit=25&search=&type=all|Text|Image|Voice|Video&status=all|draft|published|archived|removed`
- `GET /api/admin/content/:id` returns read-only post text and five-minute signed media URLs; every review is audited
- `PATCH /api/admin/content/:id/status` with `{ "action": "remove"|"restore", "reason": "..." }`
- `PATCH /api/admin/users/:id/status` with `{ "status": "NONE"|"POSTING_RESTRICTED"|"TEMPORARY_SUSPENDED"|"PERMANENTLY_SUSPENDED", "endsAt": "ISO date for temporary suspensions", "reason": "..." }`
- `PATCH /api/admin/families/:familyId/invitations/:invitationId` with `{ "action": "revoke", "reason": "..." }`
- `GET /api/admin/activity?page=1&limit=25`

Every endpoint except login requires a valid signed admin session. Session authorization is tied to the configured email and the current configured password. The existing `User.role` is not used for this separate environment-configured admin identity.

Account status, content status, and invitation actions require a reason. Their database updates, user-facing in-app notices, and `ADMIN_*` audit entries are written in one transaction; email notices are sent when SMTP is configured. Content removal changes the status to `removed`, preserves its original status and media for restoration, and filters the post from user profiles, feeds, search, albums, and family views. User-authored archived posts retain their separate `archived` status. The admin media review endpoint requires a signed admin session and writes an audit record before returning expiring attachment links.

Account restrictions support full access, posting restricted, temporary suspension, and permanent suspension. Posting restrictions block creating or editing memories, sharing, uploads, comments, creating or editing albums, adding memories to albums, and family story contributions or memory links while allowing account sign-in and reading. Suspensions revoke backend sessions; permanent suspension also disables a linked Firebase account when Firebase Admin is configured. Login responses show the restriction reason after the user proves their password. Temporary suspension expiry is applied on the user's next sign-in or protected API request.

The account restriction fields require the checked-in migration `20261126000000_add_admin_moderation_controls`. Before applying it, confirm `DATABASE_URL` points to the intended development database. Apply migrations with `npx prisma migrate deploy`, then regenerate the Prisma client with `npx prisma generate`. Temporary suspensions expire automatically the next time the user signs in or makes a protected API request.

The dashboard currently reports real user, family, memory, and media-asset data. Subscription and revenue are intentionally not included yet; the existing Stripe order domain is separate from service subscriptions.
