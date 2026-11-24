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
BACKEND_URL=http://localhost:5001
```

Use the backend's actual port. `BACKEND_URL` is server-only. The Next.js app stores the returned JWT in an HttpOnly, SameSite=Strict cookie and proxies admin API calls through its own route handlers. In production, the cookie is Secure.

## Endpoints

- `POST /api/admin/auth/login`
- `GET /api/admin/auth/me`
- `GET /api/admin/dashboard?period=30d|12m`
- `GET /api/admin/users?page=1&limit=25&search=&family=all|joined|none&sort=recent|oldest|name|active`
- `GET /api/admin/users/:id`
- `GET /api/admin/families?page=1&limit=25&search=&sort=recent|oldest|name|members`
- `GET /api/admin/families/:id`

Every endpoint except login requires a valid signed admin session. Session authorization is tied to the configured email and the current configured password. The existing `User.role` is not used for this separate environment-configured admin identity.

The dashboard currently reports real user, family, memory, and media-asset data. Subscription and revenue are intentionally not included yet; the existing Stripe order domain is separate from service subscriptions.
