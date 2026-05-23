// Route-level Suspense fallback. The marketing landing renders almost
// entirely client-side after the initial HTML, and the authenticated app
// shell has its own internal loading affordances, so this default is
// deliberately minimal — a single blank frame matching the site
// background colour. It exists to avoid the bare-document flash a slow
// server render would otherwise produce while `/`, `/file`, etc. await
// their data, and to satisfy Next's "always have a Suspense boundary"
// expectation for the root segment.
export default function RootLoading() {
  return (
    <div
      className="min-h-screen w-full bg-[var(--creed-background)]"
      aria-hidden="true"
    />
  );
}
