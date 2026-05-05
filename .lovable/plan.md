
# Fix Voice Agent Concept Field Not Being Filled

## Problem

When the voice agent calls `set_project_setup_fields` with `{ concept: "..." }` followed by `project_setup_next`, the concept text never appears in the textarea and navigation fails. Two bugs cause this:

### Bug 1: Duplicate event handlers cause concurrent execution

Both `response.function_call_arguments.done` (line 194) and `response.done` (line 178) handle tool calls. For a multi-tool response (set fields + advance):

1. `response.function_call_arguments.done` fires for call #1 (set fields) -- starts executing
2. `response.function_call_arguments.done` fires for call #2 (next) -- starts executing **concurrently**, before call #1 finishes
3. `response.done` fires -- both calls are already deduped, the sequential loop does nothing

The sequential fix from the previous change only applies to `response.done`, but calls are already consumed by the per-call handler.

### Bug 2: Multiple `response.create` for multi-tool responses

Each `executeToolCall` sends `response.create` after submitting its output. For multi-tool responses, this triggers the model to respond after the first tool output, before the second is submitted -- causing the "Cancellation failed: no active response found" errors visible in console logs.

## Changes

### File: `src/voice/realtime/useWzrdRealtimeSession.ts`

1. **Remove the `response.function_call_arguments.done` handler** (lines 193-200). Let `response.done` be the sole entry point for tool execution, which already runs calls sequentially.

2. **Batch tool outputs in `response.done`**: Instead of calling `executeToolCall` (which sends `response.create` per call), inline the execution loop to:
   - Execute each tool call sequentially
   - Send each `conversation.item.create` (function_call_output) immediately after execution
   - Send **one** `response.create` at the end, after all outputs are submitted

3. **Keep `executeToolCall` for single-call fallback**: If a single tool call somehow arrives outside `response.done`, the dedup guard still protects against double execution.

### No other files need changes

The `ProjectSetupVoiceBridge.tsx` ref-based fix from the previous change is correct and will work once tool calls execute sequentially.
