// Branding + contact constants pulled from environment variables so the
// open-source codebase doesn't ship with personal identifiers baked in.
// Set these in `.env.local` (or your deployment env) when running a fork:
//
//   NEXT_PUBLIC_CONTACT_EMAIL   = address shown in legal pages + footer
//   NEXT_PUBLIC_GITHUB_URL      = absolute URL of the project's GitHub org / repo
//
// Anything deployment-specific should be supplied through env vars so forks do
// not inherit personal contact details from source.

const fallbackContactEmail = "hello@creed.md";

const CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || fallbackContactEmail;

export const CONTACT_MAILTO = `mailto:${CONTACT_EMAIL}`;

export const GITHUB_URL = process.env.NEXT_PUBLIC_GITHUB_URL?.trim() || "";
