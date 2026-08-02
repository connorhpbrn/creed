import type { Metadata } from "next";
import { DocsPageView } from "@/components/marketing/docs-page-view";
import { JsonLd } from "@/components/marketing/json-ld";
import { breadcrumbSchema, graph, webPageSchema } from "@/lib/seo/structured-data";

const PATH = "/docs";
const TITLE = "Docs";
const DESCRIPTION =
  "What Creed is, what belongs in your profile, how to connect agents over MCP, how they read and improve it, the Company plan, and the full tool and HTTP API reference.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PATH },
};

export default function DocsPage() {
  return (
    <>
      <JsonLd
        data={graph(
          webPageSchema({ path: PATH, name: TITLE, description: DESCRIPTION }),
          breadcrumbSchema(PATH, [
            { name: "Creed", path: "/home" },
            { name: "Docs", path: PATH },
          ])
        )}
      />
      <DocsPageView />
    </>
  );
}
