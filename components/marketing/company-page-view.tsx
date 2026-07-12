import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { AnimatedPageTitle } from "@/components/marketing/animated-page-title";
import {
  MarketingFooter,
  MarketingHeroBanner,
} from "@/components/marketing/site-chrome";
import { FaqSection } from "@/components/marketing/faq-section";
import { companyFaqItems } from "@/lib/marketing/faq";
import { COMPANY_PRICING } from "@/lib/marketing/pricing";
import { cn } from "@/lib/utils";

// Server-rendered Company plan landing page. All content ships in the initial
// HTML so crawlers and answer engines read the full pitch, roles, and pricing
// without running JavaScript.

const ROLES = [
  {
    name: "Owner",
    body: "Manages billing, members, and content. Every team has one.",
    fill: "bg-[#EFF6FF] dark:bg-[#102341]/60",
    text: "text-[#1D4ED8] dark:text-[#60A5FA]",
  },
  {
    name: "Admin",
    body: "Manages members and content. Keeps the shared Creed sharp.",
    fill: "bg-[#ECFDF5] dark:bg-[#052e1a]/50",
    text: "text-[#047857] dark:text-[#4ade80]",
  },
  {
    name: "Member",
    body: "Reads the shared Creed and proposes updates their work reveals.",
    fill: "bg-[#FFFBEB] dark:bg-[#3a2a12]/50",
    text: "text-[#B45309] dark:text-[#FBBF24]",
  },
];

const HOW = [
  {
    title: "One shared file",
    body: "A Company Creed is the same structured profile as a personal one, owned by the team. It holds how you work, what you are building, and the conventions everyone should follow.",
  },
  {
    title: "Every agent reads it",
    body: "Members connect their own agents over MCP and read the shared Creed before they act, so answers match how the team actually operates instead of drifting.",
  },
  {
    title: "Proposals, not sludge",
    body: "Agents propose narrow updates as they learn. Section permissions decide who edits directly and who proposes, and every change is attributed.",
  },
  {
    title: "See the activity",
    body: "The activity view shows reads, proposals, and edits across every member and agent, so the shared context stays accountable.",
  },
];

export function CompanyPageView() {
  return (
    <div className="min-h-screen bg-[var(--creed-background)] text-[var(--creed-text-primary)]">
      <MarketingHeroBanner configured={isSupabaseConfigured()} scrolled={false} />

      <main className="mx-auto max-w-4xl px-6 pb-20 pt-8 md:px-10 md:pb-24 md:pt-10">
        <header className="border-b border-[var(--creed-border)] pb-10">
          <AnimatedPageTitle
            text="One shared context file your whole team's agents read"
            className="max-w-3xl"
          />
          <p className="mt-5 max-w-2xl text-[18px] leading-8 text-[var(--creed-text-secondary)]">
            The Company plan adds one shared Company Creed on top of your
            personal one. Every member&apos;s agents read the same company
            context before they answer, so you stop re-explaining how the team
            works to every tool. Roles, section permissions, an activity view,
            and admin controls come built in.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href="/pricing"
              className="inline-flex h-10 items-center justify-center rounded-md bg-[#2563EB] px-5 text-[14px] font-medium text-white transition-colors hover:bg-[#1D4ED8]"
            >
              See Company pricing
            </Link>
            <Link
              href="/learn/team-context-file"
              className="inline-flex h-10 items-center justify-center rounded-md border border-[var(--creed-border)] px-5 text-[14px] font-medium text-[var(--creed-text-primary)] transition-colors hover:bg-[var(--creed-surface)]"
            >
              What is a team context file?
            </Link>
          </div>
        </header>

        <section className="py-12">
          <h2 className="text-[24px] font-medium tracking-[-0.01em] text-[var(--creed-text-primary)] md:text-[28px]">
            How a Company Creed works
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {HOW.map((item) => (
              <div
                key={item.title}
                className="rounded-[16px] bg-[var(--creed-surface)] p-5"
              >
                <div className="line-clamp-1 text-[16px] font-medium text-[var(--creed-text-primary)]">
                  {item.title}
                </div>
                <p className="mt-2 text-[15px] leading-7 text-[var(--creed-text-secondary)]">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-[var(--creed-border)] py-12">
          <h2 className="text-[24px] font-medium tracking-[-0.01em] text-[var(--creed-text-primary)] md:text-[28px]">
            Roles that keep the file trusted
          </h2>
          <p className="mt-3 max-w-2xl text-[16px] leading-7 text-[var(--creed-text-secondary)]">
            A shared file only stays useful if edits are governed. Roles and
            section permissions decide who can change what, and every edit is
            attributed.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {ROLES.map((role) => (
              <article
                key={role.name}
                className="flex flex-col overflow-hidden rounded-2xl bg-[var(--creed-surface)]"
              >
                <div className={cn("px-5 py-2.5", role.fill)}>
                  <span className={cn("text-[14px] font-medium", role.text)}>
                    {role.name}
                  </span>
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <p className="text-[14px] leading-6 text-[var(--creed-text-secondary)]">
                    {role.body}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="border-t border-[var(--creed-border)] py-12">
          <h2 className="text-[24px] font-medium tracking-[-0.01em] text-[var(--creed-text-primary)] md:text-[28px]">
            Company pricing
          </h2>
          <p className="mt-3 max-w-2xl text-[16px] leading-7 text-[var(--creed-text-secondary)]">
            Every Company plan includes 10 seats and supports BYOK. Extra seats
            are available, and billing is owner-only.
          </p>
          <div className="mt-8 grid items-start gap-4 sm:grid-cols-3">
            {(["monthly", "yearly", "lifetime"] as const).map((cycle) => {
              const plan = COMPANY_PRICING[cycle];
              return (
                <div
                  key={cycle}
                  className="rounded-[16px] bg-[var(--creed-surface)] p-5"
                >
                  <div className="text-[13px] font-medium capitalize text-[var(--creed-text-tertiary)]">
                    {cycle}
                  </div>
                  <div className="mt-2 flex items-baseline gap-1.5">
                    <span className="text-[28px] font-semibold tracking-[-0.02em] text-[var(--creed-text-primary)]">
                      {plan.price}
                    </span>
                    <span className="text-[13px] text-[var(--creed-text-tertiary)]">
                      {plan.cadence}
                    </span>
                  </div>
                  <p className="mt-3 text-[14px] leading-6 text-[var(--creed-text-secondary)]">
                    {plan.tagline}
                  </p>
                </div>
              );
            })}
          </div>
          <div className="mt-7">
            <Link
              href="/pricing"
              className="text-[15px] font-medium text-[#2563EB] transition-colors hover:text-[#1D4ED8]"
            >
              Full pricing and checkout
            </Link>
          </div>
        </section>

        <FaqSection
          heading="Company plan questions"
          items={companyFaqItems}
          className="border-t border-[var(--creed-border)] py-12"
        />
      </main>

      <MarketingFooter />
    </div>
  );
}
