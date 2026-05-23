-- Once a row has the encrypted variant populated, the plaintext columns are
-- redundant. NULL them out so a stolen DB dump no longer carries cleartext.
-- Rows that have not yet been re-encrypted (no encrypted_* set) keep their
-- plaintext values and will be migrated on first access via ensureTokenRow().

alter table public.creed_tokens
  alter column read_token drop not null,
  alter column proposal_token drop not null,
  alter column direct_edit_token drop not null;

alter table public.creed_mcp_credentials
  alter column mcp_token drop not null;

update public.creed_tokens
set read_token = null
where encrypted_read_token is not null;

update public.creed_tokens
set proposal_token = null
where encrypted_proposal_token is not null;

update public.creed_tokens
set direct_edit_token = null
where encrypted_direct_edit_token is not null;

update public.creed_mcp_credentials
set mcp_token = null
where encrypted_mcp_token is not null;
