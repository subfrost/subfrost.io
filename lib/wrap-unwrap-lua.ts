/**
 * Efficient Wrap/Unwrap Aggregation using Lua Scripts
 *
 * This module executes a Lua script on the metashrew side to efficiently
 * aggregate all wrap/unwrap data for frBTC without fetching all transactions
 * to the client side.
 */

import { alkanesClient } from './alkanes-client';
import { readFileSync } from 'fs';
import { join } from 'path';

// ============================================================================
// Types
// ============================================================================

export interface WrapUnwrapLuaResult {
  totalWrapped: number;
  totalUnwrapped: number;
  wrapCount: number;
  unwrapCount: number;
  wraps: Array<{
    txid: string;
    amount: number;
    blockHeight: number;
    senderAddress: string;
  }>;
  unwraps: Array<{
    txid: string;
    amount: number;
    blockHeight: number;
    recipientAddress: string;
  }>;
  lastBlockHeight: number;
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Execute the wrap/unwrap aggregator Lua script
 * This runs on the metashrew side for maximum efficiency
 */
export async function getWrapUnwrapViaLua(fromBlockHeight: number = 0): Promise<WrapUnwrapLuaResult> {
  console.log('[LuaAggregator] Starting Lua-based wrap/unwrap aggregation...');

  try {
    // Load the Lua script
    const luaScript = readFileSync(join(__dirname, 'wrap-unwrap-aggregator.lua'), 'utf-8');

    // Execute via alkanes client
    const result = await alkanesClient.executeLuaScript<WrapUnwrapLuaResult>(
      luaScript,
      [fromBlockHeight]
    );

    console.log(`[LuaAggregator] Complete: ${result.wrapCount} wraps, ${result.unwrapCount} unwraps`);
    console.log(`[LuaAggregator] Total: ${result.totalWrapped / 1e8} BTC wrapped, ${result.totalUnwrapped / 1e8} BTC unwrapped`);

    return result;
  } catch (error) {
    console.error('[LuaAggregator] Error executing Lua script:', error);
    throw error;
  }
}

/**
 * Inline version for testing without file I/O
 */
export async function getWrapUnwrapViaInlineLua(fromBlockHeight: number = 0): Promise<WrapUnwrapLuaResult> {
  const luaScript = `
    local subfrost_address = "bc1p5lushqjk7kxpqa87ppwn0dealucyqa6t40ppdkhpqm3grcpqvw9s3wdsx7"
    local from_height = ... or 0

    local result = {
      totalWrapped = 0,
      totalUnwrapped = 0,
      wrapCount = 0,
      unwrapCount = 0,
      wraps = {},
      unwraps = {},
      lastBlockHeight = 0
    }

    -- Get all transactions with traces
    local txs_with_traces = _RPC["esplora_address::txs:chain"](subfrost_address)

    local function is_frbtc(alkane_id)
      if not alkane_id then return false end
      local block_num = type(alkane_id.block) == "table" and alkane_id.block.lo or alkane_id.block
      local tx_num = type(alkane_id.tx) == "table" and alkane_id.tx.lo or alkane_id.tx
      return block_num == 32 and tx_num == 0
    end

    local function parse_value(transfer)
      if not transfer or not transfer.value then return 0 end
      local value = transfer.value
      if type(value) == "table" and value.lo then
        return (value.hi or 0) * 2^64 + value.lo
      end
      return tonumber(value) or 0
    end

    for _, tx in ipairs(txs_with_traces or {}) do
      local block_height = tx.status and tx.status.block_height or 0
      if block_height >= from_height and tx.alkanes_traces then
        for _, trace_entry in ipairs(tx.alkanes_traces) do
          local trace = trace_entry.trace and trace_entry.trace.trace
          if trace and trace.events then
            for _, event_wrapper in ipairs(trace.events) do
              local event = event_wrapper.event
              if event then
                -- Wraps (ReceiveIntent)
                if event.ReceiveIntent and event.ReceiveIntent.incoming_alkanes then
                  for _, transfer in ipairs(event.ReceiveIntent.incoming_alkanes) do
                    if is_frbtc(transfer.id) then
                      local amount = parse_value(transfer)
                      if amount > 0 then
                        result.totalWrapped = result.totalWrapped + amount
                        result.wrapCount = result.wrapCount + 1
                        local sender = tx.vin and tx.vin[1] and tx.vin[1].prevout and tx.vin[1].prevout.scriptpubkey_address or ""
                        table.insert(result.wraps, { txid = tx.txid, amount = amount, blockHeight = block_height, senderAddress = sender })
                      end
                    end
                  end
                end
                -- Unwraps (ValueTransfer)
                if event.ValueTransfer and event.ValueTransfer.transfers then
                  for _, transfer in ipairs(event.ValueTransfer.transfers) do
                    if is_frbtc(transfer.id) then
                      local amount = parse_value(transfer)
                      if amount > 0 then
                        result.totalUnwrapped = result.totalUnwrapped + amount
                        result.unwrapCount = result.unwrapCount + 1
                        local recipient = ""
                        if tx.vout then
                          for _, output in ipairs(tx.vout) do
                            local addr = output.scriptpubkey_address
                            if addr and addr ~= subfrost_address and output.scriptpubkey_type ~= "op_return" then
                              recipient = addr
                              break
                            end
                          end
                        end
                        table.insert(result.unwraps, { txid = tx.txid, amount = amount, blockHeight = block_height, recipientAddress = recipient })
                      end
                    end
                  end
                end
              end
            end
          end
        end
        if block_height > result.lastBlockHeight then
          result.lastBlockHeight = block_height
        end
      end
    end

    return result
  `;

  console.log('[LuaAggregator] Executing inline Lua script...');

  const result = await alkanesClient.executeLuaScript<WrapUnwrapLuaResult>(
    luaScript,
    [fromBlockHeight]
  );

  console.log(`[LuaAggregator] Complete: ${result.wrapCount} wraps, ${result.unwrapCount} unwraps`);

  return result;
}
