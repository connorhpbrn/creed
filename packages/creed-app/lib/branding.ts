// Branding + contact constants pulled from environment variables so the
// open-source codebase doesn't ship with personal identifiers baked in.
// Set these in `.env.local` (or your deployment env) when running a fork:
//
//   NEXT_PUBLIC_CONTACT_EMAIL   = address shown in legal pages + footer
//   NEXT_PUBLIC_LEGAL_OPERATOR_NAME = legal operator shown in hosted terms
//   NEXT_PUBLIC_TWITTER_URL     = absolute URL of the project's X / Twitter profile
//   NEXT_PUBLIC_INSTAGRAM_URL   = absolute URL of the project's Instagram profile
//   NEXT_PUBLIC_GITHUB_URL      = absolute URL of the project's GitHub org / repo
//   NEXT_PUBLIC_HPBRN_URL       = absolute URL of the hpbrn site/profile
//
// Anything left unset falls back to a sensible no-op (an empty string for the
// email, `null` for social links so the chrome can hide the icon entirely).

export const CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || "";
export const LEGAL_OPERATOR_NAME =
  process.env.NEXT_PUBLIC_LEGAL_OPERATOR_NAME?.trim() || "Creed";

export const CONTACT_MAILTO = `mailto:${CONTACT_EMAIL}`;

// Default social URLs surface on the deployed site without needing env
// vars set. Forks can override via NEXT_PUBLIC_*_URL or set the env var
// to an empty string to hide the icon entirely.
export const TWITTER_URL =
  process.env.NEXT_PUBLIC_TWITTER_URL?.trim() || "";
export const INSTAGRAM_URL =
  process.env.NEXT_PUBLIC_INSTAGRAM_URL?.trim() || "";
export const GITHUB_URL =
  process.env.NEXT_PUBLIC_GITHUB_URL?.trim() || "https://github.com/connorhpbrn/creed";
export const HPBRN_URL =
  process.env.NEXT_PUBLIC_HPBRN_URL?.trim() || "";

export const DISCORD_URL = "https://discord.gg/4AxX8AbwH8";
