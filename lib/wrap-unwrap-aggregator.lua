--[[
Efficient Wrap/Unwrap Aggregator for frBTC (32:0)
Runs on metashrew side for maximum performance

This script:
1. Gets all transactions for the subfrost address
2. Extracts unique block heights
3. Uses traceblock to get complete block traces
4. Filters for frBTC (32:0) transfers
5. Aggregates wrap/unwrap totals

Returns: { totalWrapped, totalUnwrapped, wrapCount, unwrapCount, wraps, unwraps }
]]--

local subfrost_address = "bc1p5lushqjk7kxpqa87ppwn0dealucyqa6t40ppdkhpqm3grcpqvw9s3wdsx7"
local from_height = ... or 0  -- Optional starting block height

-- Initialize result structure
local result = {
  totalWrapped = 0,
  totalUnwrapped = 0,
  wrapCount = 0,
  unwrapCount = 0,
  wraps = {},
  unwraps = {},
  lastBlockHeight = 0
}

-- Get all transactions with traces for the subfrost address
local txs_with_traces = _RPC["esplora_address::txs:chain"](subfrost_address)

-- Helper: Check if alkane ID is frBTC (32:0)
local function is_frbtc(alkane_id)
  if not alkane_id then return false end
  local block_num = alkane_id.block
  local tx_num = alkane_id.tx

  -- Handle both direct numbers and {lo, hi} format
  if type(block_num) == "table" then
    block_num = block_num.lo or 0
  end
  if type(tx_num) == "table" then
    tx_num = tx_num.lo or 0
  end

  return block_num == 32 and tx_num == 0
end

-- Helper: Parse uint128 value
local function parse_value(transfer)
  if not transfer or not transfer.value then return 0 end
  local value = transfer.value

  if type(value) == "table" and value.lo then
    -- uint128 format: (hi << 64) | lo
    local lo = value.lo or 0
    local hi = value.hi or 0
    -- Lua 5.4+ supports proper 64-bit integers
    return (hi * 2^64) + lo
  end

  return tonumber(value) or 0
end

-- Process each transaction
for _, tx in ipairs(txs_with_traces or {}) do
  local block_height = tx.status and tx.status.block_height or 0

  if block_height >= from_height and tx.alkanes_traces then

      for _, trace_entry in ipairs(tx.alkanes_traces) do
        local trace = trace_entry.trace and trace_entry.trace.trace
        if trace and trace.events then

          for _, event_wrapper in ipairs(trace.events) do
            local event = event_wrapper.event
            if not event then goto continue_event end

            -- Check for ReceiveIntent (wraps)
            if event.ReceiveIntent and event.ReceiveIntent.incoming_alkanes then
              for _, transfer in ipairs(event.ReceiveIntent.incoming_alkanes) do
                if is_frbtc(transfer.id) then
                  local amount = parse_value(transfer)
                  if amount > 0 then
                    result.totalWrapped = result.totalWrapped + amount
                    result.wrapCount = result.wrapCount + 1

                    -- Extract sender address from tx inputs
                    local sender_address = ""
                    if tx.vin and tx.vin[1] and tx.vin[1].prevout then
                      sender_address = tx.vin[1].prevout.scriptpubkey_address or ""
                    end

                    table.insert(result.wraps, {
                      txid = tx.txid,
                      amount = amount,
                      blockHeight = block_height,
                      senderAddress = sender_address
                    })
                  end
                end
              end
            end

            -- Check for ValueTransfer (unwraps)
            if event.ValueTransfer and event.ValueTransfer.transfers then
              for _, transfer in ipairs(event.ValueTransfer.transfers) do
                if is_frbtc(transfer.id) then
                  local amount = parse_value(transfer)
                  if amount > 0 then
                    result.totalUnwrapped = result.totalUnwrapped + amount
                    result.unwrapCount = result.unwrapCount + 1

                    -- Extract recipient address from tx outputs (not subfrost, not OP_RETURN)
                    local recipient_address = ""
                    if tx.vout then
                      for _, output in ipairs(tx.vout) do
                        local addr = output.scriptpubkey_address
                        if addr and addr ~= subfrost_address and output.scriptpubkey_type ~= "op_return" then
                          recipient_address = addr
                          break
                        end
                      end
                    end

                    table.insert(result.unwraps, {
                      txid = tx.txid,
                      amount = amount,
                      blockHeight = block_height,
                      recipientAddress = recipient_address
                    })
                  end
                end
              end
            end

            ::continue_event::
          end
        end
      end

    -- Update last block height
    if block_height > result.lastBlockHeight then
      result.lastBlockHeight = block_height
    end
  end
end

print(string.format("[LUA] Complete: %d wraps (%.8f BTC), %d unwraps (%.8f BTC)",
  result.wrapCount,
  result.totalWrapped / 1e8,
  result.unwrapCount,
  result.totalUnwrapped / 1e8
))

return result
