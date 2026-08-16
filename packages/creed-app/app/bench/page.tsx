import type { Metadata } from "next";
import type { ReactNode } from "react";
import { isSupabaseConfigured } from "@creed/persistence/supabase/env";
import { AnimatedPageTitle } from "@/components/marketing/animated-page-title";
import { CodeCommand } from "@/components/marketing/code-command";
import { CreedBenchChart } from "@/components/marketing/creed-bench-chart";
import {
  MarketingFooter,
  MarketingHeroBanner,
} from "@/components/marketing/site-chrome";
import { JsonLd } from "@/components/marketing/json-ld";
import { breadcrumbSchema, graph, webPageSchema } from "@/lib/seo/structured-data";
import { BENCH_TASKS } from "@/bench/tasks";
import { CREED_BENCH_TOOLS } from "@/bench/tool-contract";

const PATH = "/bench";
const TITLE = "Benchmarks";
const DESCRIPTION =
  "Creed Bench measures how well frontier models use Creed through its tools.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PATH },
};

function BenchCommand({
  copyText,
  children,
}: {
  copyText: string;
  children: ReactNode;
}) {
  return <CodeCommand copyText={copyText}>{children}</CodeCommand>;
}

function BenchTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: string[][];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--creed-border)]">
      <table className="w-full border-collapse text-left text-[14px]">
        <thead>
          <tr className="border-b border-[var(--creed-border)] bg-[var(--creed-surface)]">
            {headers.map((header) => (
              <th
                key={header}
                className="px-4 py-3 font-medium text-[var(--creed-text-primary)]"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.join("|")}
              className="border-b border-[var(--creed-border)] last:border-0"
            >
              {row.map((cell, index) => (
                <td
                  key={`${row[0]}-${index}`}
                  className={
                    index === 0
                      ? "px-4 py-3 font-medium text-[var(--creed-text-primary)]"
                      : "px-4 py-3 text-[var(--creed-text-secondary)]"
                  }
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function familyLabel(family: (typeof BENCH_TASKS)[number]["family"]) {
  if (family === "single-tool") return "Single-tool";
  if (family === "multi-tool") return "Multi-tool";
  return "Adversarial";
}

export default function BenchPage() {
  const singleToolRows = BENCH_TASKS.filter(
    (task) => task.family === "single-tool",
  ).map((task) => [task.title, task.toolsCovered.join(", ")]);
  const workflowRows = BENCH_TASKS.filter(
    (task) => task.family !== "single-tool",
  ).map((task) => [
    task.title,
    familyLabel(task.family),
    task.toolsCovered.join(", "),
  ]);

  return (
    <>
      <JsonLd
        data={graph(
          webPageSchema({ path: PATH, name: TITLE, description: DESCRIPTION }),
          breadcrumbSchema(PATH, [
            { name: "Creed", path: "/home" },
            { name: "Benchmarks", path: PATH },
          ])
        )}
      />
      <div className="flex min-h-screen flex-col bg-[var(--creed-background)] text-[var(--creed-text-primary)]">
        <MarketingHeroBanner configured={isSupabaseConfigured()} scrolled={false} />

        <main className="mx-auto w-full max-w-4xl flex-1 px-4 pb-20 pt-8 sm:px-6 md:px-10 md:pb-24 md:pt-10">
          <header className="border-b border-[var(--creed-border)] pb-8">
            <AnimatedPageTitle text={TITLE} />
          </header>
          <div className="mt-12">
            <CreedBenchChart />
          </div>

          <section className="mt-12 border-t border-[var(--creed-border)] pt-8">
            <h2 className="text-[20px] font-medium tracking-[-0.02em] text-[var(--creed-text-primary)] sm:text-[24px]">
              How Creed Bench works
            </h2>
            <div className="mt-3 space-y-5 text-[15px] leading-7 text-[var(--creed-text-secondary)]">
              <p>
                Creed Bench measures whether a model can use Creed the way a
                connected agent should: through the real MCP tool surface, not
                by stuffing context into a prompt and hoping for the best.
              </p>
              <p>Try a model with one medium-effort pass over the full suite:</p>
              <BenchCommand copyText="npm run bench -- openai/gpt-5.6-sol">
                <span className="hljs-built_in">npm</span> run{" "}
                <span className="hljs-title">bench</span>{" "}
                <span className="hljs-attribute">--</span>{" "}
                <span className="hljs-string">openai/gpt-5.6-sol</span>
              </BenchCommand>
              <p>
                Each trial starts from a fresh synthetic Creed. The model gets
                the same {CREED_BENCH_TOOLS.length} tools production agents get,
                one user request, and a live write policy. It can read, search,
                update, append, create, rename, recolor, reorder, delete,
                propose, or decide nothing durable happened and leave the file
                alone.
              </p>
              <p>
                Eight tasks are single-tool, ten are realistic multi-tool
                workflows, and six are adversarial policy or restraint cases.
                Together they cover every Creed MCP tool, including when to
                write, when not to, formatting, maintenance, recovery from bad
                arguments, and locked or proposal-only sections.
              </p>
              <p>
                Single-tool tasks check that the model can find and use the
                right Creed tool for a narrow request:
              </p>
              <BenchTable
                headers={["Task", "Tools covered"]}
                rows={singleToolRows}
              />
              <p>
                Multi-tool and adversarial tasks check realistic maintenance
                workflows, plus when the model must refuse, recover, or obey
                proposal-only and read-only policy:
              </p>
              <BenchTable
                headers={["Task", "Type", "Tools covered"]}
                rows={workflowRows}
              />
              <p>Inspect the same list from the CLI:</p>
              <BenchCommand copyText="npm run bench -- --list">
                <span className="hljs-built_in">npm</span> run{" "}
                <span className="hljs-title">bench</span>{" "}
                <span className="hljs-attribute">--</span>{" "}
                <span className="hljs-attribute">--list</span>
              </BenchCommand>
              <p>
                When the model finishes, deterministic graders check the
                outcome: final Creed state, proposal versus direct mode,
                required contract steps, forbidden mutations, and whether the
                answer is grounded. Equivalent correct paths can pass. Lucky
                one-shot trajectories are not enough on their own.
              </p>
              <p>Iterate on one task while building or debugging a grader:</p>
              <BenchCommand copyText="npm run bench -- openai/gpt-5.6-sol --task append-durable-preference">
                <span className="hljs-built_in">npm</span> run{" "}
                <span className="hljs-title">bench</span>{" "}
                <span className="hljs-attribute">--</span>{" "}
                <span className="hljs-string">openai/gpt-5.6-sol</span>{" "}
                <span className="hljs-attribute">--task</span>{" "}
                <span className="hljs-string">append-durable-preference</span>
              </BenchCommand>
              <p>
                The graph plots Pass@1 against average cost per task attempt.
                Pass@1 is whether the first trial for each task succeeds.
                Hover a model square in the legend for average cost, total cost, and total tokens.
                Official runs measure Pass^3, the share of tasks that succeed
                in all three repeats.
              </p>
              <p>
                Publish a complete official result: all {BENCH_TASKS.length}{" "}
                tasks, three trials each, at low, medium, and high effort.
              </p>
              <BenchCommand copyText="npm run bench -- openai/gpt-5.6-sol --official --yes">
                <span className="hljs-built_in">npm</span> run{" "}
                <span className="hljs-title">bench</span>{" "}
                <span className="hljs-attribute">--</span>{" "}
                <span className="hljs-string">openai/gpt-5.6-sol</span>{" "}
                <span className="hljs-attribute">--official</span>{" "}
                <span className="hljs-attribute">--yes</span>
              </BenchCommand>
              <p>
                Every run keeps the full tool transcript, before and after
                state, verifier checks, model route, tokens, cost, benchmark
                version, and runner commit. Only complete official results
                appear in the graph above.
              </p>
            </div>
          </section>
        </main>

        <MarketingFooter />
      </div>
    </>
  );
}
