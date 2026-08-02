// Renders a Schema.org JSON-LD document into a <script type="application/ld+json">.
// Build the `data` object with the helpers in lib/seo/structured-data.ts.
//
// The payload is first-party constant data, but we still escape `<` to
// `<` so a stray angle bracket can never close the script tag early -
// the standard safe-embed practice for inline JSON-LD.

export function JsonLd({ data }: { data: object }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");

  return (
    <script
      type="application/ld+json"
      // First-party structured data only; escaped above.
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
