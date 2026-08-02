export type OAuthMcpScopes = {
  read: boolean;
  propose: boolean;
  directEdit: boolean;
};

export type OAuthPermissionCeiling = "read-only" | "propose" | "direct";

export function parseOAuthMcpScopes(scope: string): OAuthMcpScopes {
  const values = new Set(scope.split(/\s+/).filter(Boolean));
  return {
    read: values.has("read"),
    propose: values.has("propose"),
    directEdit: values.has("direct_edit"),
  };
}

export function oauthPermissionCeiling(scopes: OAuthMcpScopes): OAuthPermissionCeiling {
  if (scopes.directEdit) return "direct";
  if (scopes.propose) return "propose";
  return "read-only";
}
