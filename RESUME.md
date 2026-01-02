# Resume Point - API Migration to OYL Endpoints

## Date: 2026-01-02

## Reference Commit
All changes are based on reference commit `95edc9854e19876d8cd44e8bd4f25f76563c5c77`, which has been extracted to:
```
reference/95edc98/
```

## Summary of Changes

### 1. frBTC Issued API (`app/api/frbtc-issued/route.ts`)
**Status: UPDATED**

- Uses `@alkanes/ts-sdk` via `alkanesClient.getProvider().getStorageAt(32, 0, path)`
- Queries `/totalsupply` storage path on alkane `32:0`
- Applies offset of `4443097n` satoshis (from reference)
- Returns: `{ frBtcIssued: number }` (in BTC)

**Test:**
```bash
curl http://localhost:3000/api/frbtc-issued
# Returns: {"frBtcIssued":0.38832811}
```

### 2. Wrap History API (`app/api/wrap-history/route.ts`)
**Status: UPDATED**

- Now uses OYL mainnet API: `https://mainnet-api.oyl.gg/get-all-wrap-history`
- Supports pagination via `count` and `offset` query params
- API Key: `d6aebfed1769128379aca7d215f0b689`

### 3. Unwrap History API (`app/api/unwrap-history/route.ts`)
**Status: UPDATED**

- Now uses OYL mainnet API: `https://mainnet-api.oyl.gg/get-all-unwrap-history`
- Supports pagination via `count` and `offset` query params

### 4. Total Unwraps API (`app/api/total-unwraps/route.ts`)
**Status: UPDATED**

- Now uses OYL mainnet API: `https://mainnet-api.oyl.gg/get-total-unwrap-amount`
- Returns: `{ totalUnwraps: string }` (in satoshis)

**Test:**
```bash
curl http://localhost:3000/api/total-unwraps
# Returns: {"totalUnwraps":"89494469"}
```

### 5. Wrap/Unwrap Totals API (`app/api/wrap-unwrap-totals/route.ts`)
**Status: UPDATED**

- Fetches total unwrap from OYL `get-total-unwrap-amount`
- Fetches all wraps via pagination from `get-all-wrap-history` and sums amounts
- Returns both `totalWrappedBtc` and `totalUnwrappedBtc`

**Test:**
```bash
curl http://localhost:3000/api/wrap-unwrap-totals
# Returns: {"totalWrappedFrbtc":"124843067","totalUnwrappedFrbtc":"89494469","totalWrappedBtc":1.24843067,"totalUnwrappedBtc":0.89494469,"wrapCount":496,"timestamp":...}
```

### 6. MetricsBoxes Component (`components/MetricsBoxes.tsx`)
**Status: UPDATED**

Changed Lifetime BTC Tx Value calculation to match reference:

**Before (current branch):**
```typescript
lifetimeBtcTxValue = wrapUnwrapTotals.totalWrappedBtc + wrapUnwrapTotals.totalUnwrappedBtc
```

**After (matching reference):**
```typescript
const totalUnwrapsValue = useMetric('/api/total-unwraps', 'totalUnwraps', (value) => value / 1e8);
lifetimeBtcTxValue = frBtcIssuedValue + totalUnwrapsValue
```

**Logic:** `Lifetime BTC Tx Value = Current Supply + Total Unwrapped = Total Wrapped`

## Metrics Calculation Summary

| Metric | Formula | Current Value |
|--------|---------|---------------|
| Current frBTC Supply | `frBtcIssued` (from storage - offset) | 0.38832811 BTC |
| Lifetime BTC Tx Value | `frBtcIssued + totalUnwraps` | 1.28327280 BTC |
| BTC Locked | Sum of UTXOs at subfrost address | (unchanged) |

## APIs NOT Yet Updated (may need review)

These APIs exist in the reference but weren't explicitly updated in this session:

- `app/api/btc-locked/route.ts` - May need review
- `app/api/btc-price/route.ts` - May need review
- `app/api/get-address-wrap-history/route.ts` - May need review
- `app/api/get-address-unwrap-history/route.ts` - May need review
- `app/api/get-alkanes-by-address/route.ts` - May need review

## Reference Files Location

All original reference files from commit `95edc98` are available at:
```
reference/95edc98/
├── app/
│   └── api/
│       ├── btc-locked/route.ts
│       ├── btc-price/route.ts
│       ├── frbtc-issued/route.ts
│       ├── get-address-unwrap-history/route.ts
│       ├── get-address-wrap-history/route.ts
│       ├── get-alkanes-by-address/route.ts
│       ├── total-unwraps/route.ts
│       ├── unwrap-history/route.ts
│       └── wrap-history/route.ts
├── components/
├── hooks/
└── ...
```

## OYL API Reference

Base URL: `https://mainnet-api.oyl.gg`
API Key: `d6aebfed1769128379aca7d215f0b689`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/get-all-wrap-history` | POST | Paginated wrap history |
| `/get-all-unwrap-history` | POST | Paginated unwrap history |
| `/get-total-unwrap-amount` | POST | Total unwrapped amount |

Note: There is NO `get-total-wrap-amount` endpoint - must sum from history.

## Next Steps

1. Review and potentially update remaining APIs (btc-locked, btc-price, address history APIs)
2. Remove maintenance warning from MetricsBoxes if metrics are accurate
3. Consider removing unused sync-service and Redis caching code if no longer needed
4. Test all metrics on production
