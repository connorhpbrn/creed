import type { Metadata } from "next";
import { RoadmapPageView } from "@/components/marketing/roadmap-page-view";
import { fetchRoadmap } from "@/lib/marketing/fetch-roadmap";
import { JsonLd } from "@/components/marketing/json-ld";
import { breadcrumbSchema, graph, webPageSchema } from "@/lib/seo/structured-data";

const PATH = "/roadmap";
const TITLE = "Roadmap";
const DESCRIPTION =
  "A live view of what we're building, straight from Creed's task board.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PATH },
};

// ISR: re-fetch the live median board about once a minute, so moving a task
// between phases on the median board shows up here within ~60s with no
// redeploy. median has no webhooks, so poll-on-revalidate is the freshest we
// can be while still serving a cached, prerendered page. The median API key is
// read server-side in fetchRoadmap and never reaches the client; only the
// mapped, public-safe columns are passed down. The page reads no
// cookies/headers, so it stays off the user-state fan-out like the other
// marketing routes.
export const revalidate = 60;

export default async function RoadmapPage() {
  const columns = await fetchRoadmap();
  return (
    <>
      <JsonLd
        data={graph(
          webPageSchema({ path: PATH, name: TITLE, description: DESCRIPTION }),
          breadcrumbSchema(PATH, [
            { name: "Creed", path: "/home" },
            { name: "Roadmap", path: PATH },
          ])
        )}
      />
      <RoadmapPageView columns={columns} />
    </>
  );
}
