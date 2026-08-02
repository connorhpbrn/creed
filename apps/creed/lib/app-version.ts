export function getAppVersion() {
  return (
    process.env.NEXT_PUBLIC_RELEASE_SHA?.trim() ||
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.trim() ||
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    process.env.VERCEL_DEPLOYMENT_ID?.trim() ||
    (process.env.NODE_ENV === "production" ? "unknown" : "development")
  );
}
