import type { Metadata } from "next";
import { StackPageView } from "@/components/marketing/stack-page-view";
import { JsonLd } from "@/components/marketing/json-ld";
import { breadcrumbSchema, graph, webPageSchema } from "@/lib/seo/structured-data";

const PATH = "/stack";
const TITLE = "Stack";
const DESCRIPTION =
  "The technology Creed uses to run, store, and process your data.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PATH },
};

export default function StackPage() {
  return (
    <>
      <JsonLd
        data={graph(
          webPageSchema({ path: PATH, name: TITLE, description: DESCRIPTION }),
          breadcrumbSchema(PATH, [
            { name: "Creed", path: "/home" },
            { name: "Stack", path: PATH },
          ])
        )}
      />
      <StackPageView />
    </>
  );
}
