-- Preserve existing connections across the RFC 8707 rollout. New rows take
-- the deployment-derived resource from the authorization server.
update public.oauth_authorization_codes
set resource = 'https://creed.md/mcp'
where resource is null;

update public.oauth_tokens
set resource = 'https://creed.md/mcp'
where resource is null;
