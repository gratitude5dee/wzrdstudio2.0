# Skill: billing-checkout

**Endpoint**: `POST /functions/v1/billing-checkout`
**Body**: `{ "kind": "plan" | "pack", "code": "pro" | "pack_100" }`
**Returns**: `{ "checkout_url": "https://…" }` — open in browser.

Poll plan status: `GET /functions/v1/billing-portal` returns `{ subscription, credits }`.
