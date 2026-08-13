import { docsEntries } from "../components/docs-content";
import { DocsShell } from "../components/docs-shell";

export default function DocsPage() {
  return <DocsShell entries={docsEntries} />;
}
