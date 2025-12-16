This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Admin API Endpoints

The application includes protected admin endpoints for managing sync operations. These endpoints require authentication via the `ADMIN_SECRET` environment variable.

### Authentication

All admin endpoints require an `x-admin-secret` header:

```bash
curl -X POST https://your-domain.com/api/admin/reset-sync \
  -H "x-admin-secret: your-admin-secret"
```

### Available Endpoints

#### POST `/api/admin/reset-sync`

Resets the wrap/unwrap sync state and clears all transaction data, forcing a complete re-sync on the next API call.

**Response:**
```json
{
  "success": true,
  "deletedWraps": 123,
  "deletedUnwraps": 456,
  "message": "Sync state reset complete. Next API call will trigger a full re-sync with address extraction.",
  "warning": "A sync was in progress when reset was triggered" // Optional
}
```

#### GET `/api/admin/sync-status`

Returns the current status of all sync operations including lock states and last synced block heights.

**Response:**
```json
{
  "locks": {
    "wrapUnwrap": false,
    "btcLocked": false,
    "frbtcSupply": false,
    "fullSync": false
  },
  "syncState": {
    "wrapUnwrap": {
      "lastBlockHeight": 927926,
      "totalWrapped": "1000000000",
      "totalUnwrapped": "500000000",
      "wrapCount": 10,
      "unwrapCount": 5,
      "updatedAt": "2024-01-15T10:30:00.000Z"
    },
    "btcLocked": { ... },
    "frbtcSupply": { ... }
  },
  "anySyncInProgress": false,
  "timestamp": 1705319400000
}
```

### Distributed Locking

The application uses Redis-based distributed locking to prevent concurrent sync operations. This ensures:

- Multiple API requests won't start duplicate sync jobs
- Sync operations run sequentially, not in parallel
- If a sync is in progress, subsequent requests wait for it to complete (up to 15 minutes)
- Locks automatically expire after 10 minutes to prevent deadlocks

Lock keys used:
- `lock:wrap_unwrap_sync` - Wrap/unwrap transaction sync
- `lock:btc_locked_sync` - BTC locked snapshot sync
- `lock:frbtc_supply_sync` - frBTC supply snapshot sync
- `lock:full_sync` - Full sync of all data types

### Configuration

Set the admin secret in your environment:

```bash
# .env
ADMIN_SECRET="your-secure-random-string"
```

For production deployments, configure this as a GitHub repository secret or in your deployment platform's environment variables.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
