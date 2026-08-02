-- Company plan follow-up (SAFE TO APPLY NOW - additive, backward compatible).
--
-- The OAuth consent screen now lets a user pick which Creeds (spaces) an agent
-- may access. That choice is captured on the short-lived authorization code and
-- copied into oauth_token_creeds when the token is issued. This column carries
-- the chosen grants across the code -> token exchange.
--
-- Shape: a JSON array of { "creedId": "<uuid>", "mode": "read-only" |
-- "proposal-only" | "direct" }. Nullable so any code minted before this column
-- existed still redeems (treated as "no explicit grants"); the redemption path
-- coalesces null to an empty array and MCP enforcement then falls back to the
-- token owner's personal Creed, never to all Creeds.
alter table public.oauth_authorization_codes
  add column if not exists creed_grants jsonb;
