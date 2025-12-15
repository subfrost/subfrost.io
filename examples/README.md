# Examples

This directory contains example code demonstrating how to use the Subfrost wrap/unwrap aggregation functions.

## Block Range Queries

The `query-block-range.ts` example demonstrates how to query wrap/unwrap data for specific block height ranges.

### Running the Example

```bash
# Using ts-node
npx ts-node examples/query-block-range.ts

# Or using tsx
npx tsx examples/query-block-range.ts
```

### Usage Patterns

#### 1. Query from a starting block to latest

```typescript
import { alkanesClient } from '@/lib/alkanes-client';
import { getWrapUnwrapFromBlockRange } from '@/lib/alkanes-client-v2';

const provider = await alkanesClient.ensureProvider();
const result = await getWrapUnwrapFromBlockRange(provider, 850000);
// Returns all wraps/unwraps from block 850000 to latest
```

#### 2. Query a specific block range

```typescript
const result = await getWrapUnwrapFromBlockRange(provider, 850000, 860000);
// Returns wraps/unwraps only between blocks 850000 and 860000 (inclusive)
```

#### 3. Query all historical data

```typescript
const result = await getWrapUnwrapFromBlockRange(provider, 0);
// Returns all wraps/unwraps from genesis to latest
```

### Result Structure

```typescript
interface WrapUnwrapResult {
  totalWrapped: bigint;           // Total amount wrapped in satoshis
  totalUnwrapped: bigint;         // Total amount unwrapped in satoshis
  wrapCount: number;              // Number of wrap transactions
  unwrapCount: number;            // Number of unwrap transactions
  wraps: Array<{
    txid: string;                 // Transaction ID
    amount: bigint;               // Amount wrapped in satoshis
    blockHeight: number;          // Block height
    senderAddress: string;        // Address that sent BTC
  }>;
  unwraps: Array<{
    txid: string;                 // Transaction ID
    amount: bigint;               // Amount unwrapped in satoshis
    blockHeight: number;          // Block height
    recipientAddress: string;     // Address receiving BTC
  }>;
  lastBlockHeight: number;        // Highest block height in results
}
```

### Use Cases

- **Historical Analysis**: Query specific time periods to analyze wrap/unwrap patterns
- **Testing**: Verify correctness by testing against known block ranges
- **Incremental Sync**: Process new blocks incrementally by tracking last synced block
- **Performance Testing**: Test aggregation speed on different range sizes
- **Debugging**: Isolate and analyze specific transactions by block range

## Testing

Run the integration tests to verify the implementation:

```bash
# Run all V2 tests
RUN_INTEGRATION=true pnpm vitest run tests/integration/block-traces-v2.test.ts

# Run a specific test
RUN_INTEGRATION=true pnpm vitest run tests/integration/block-traces-v2.test.ts -t "specific block range"
```
