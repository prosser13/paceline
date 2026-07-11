-- Per-token scope for MCP write access. 'read' (default) = read-only; 'read write'
-- grants the write tools. OAuth connections carry the equivalent in oauth_tokens.scope
-- (space-delimited, includes 'mcp:write' when write is granted at consent).
alter table mcp_tokens add column if not exists scopes text not null default 'read';
