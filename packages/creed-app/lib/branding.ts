// Contact and legal operator stay in env so personal identity is not baked
// into the public repo. Public product links are constants here. An empty
// social URL hides the corresponding footer icon.

export const CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || "";
export const LEGAL_OPERATOR_NAME =
  process.env.NEXT_PUBLIC_LEGAL_OPERATOR_NAME?.trim() || "Creed";

export const CONTACT_MAILTO = `mailto:${CONTACT_EMAIL}`;

export const GITHUB_URL = "https://github.com/hpbrn/creed";
export const DISCORD_URL = "https://discord.gg/4AxX8AbwH8";
export const TWITTER_URL = "https://x.com/connorhpbrn";
export const INSTAGRAM_URL = "https://www.instagram.com/connorhpbrn";
