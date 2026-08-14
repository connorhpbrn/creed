"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRightIcon,
  type ArrowUpRightIconHandle,
} from "@creed/ui/arrow-up-right";
import { AnimatedPageTitle, AnimatedSectionHeading } from "@/components/marketing/animated-page-title";
import { MarketingFooter, MarketingHeroBanner } from "@/components/marketing/site-chrome";
import { CONTACT_EMAIL } from "@/lib/branding";
import { useCreedEdition } from "@/components/creed/edition-provider";

const contactEmail = CONTACT_EMAIL;

type PrivacySection = {
  id: string;
  title: string;
  paragraphs?: string[];
  bullets?: string[];
  note?: string;
};

const cloudSections: PrivacySection[] = [
  {
    id: "scope",
    title: "Who this policy applies to",
    paragraphs: [
      "This policy applies to people who use Creed, including people who create an account, complete onboarding, connect agents, submit or review proposals, or otherwise use the service.",
    ],
  },
  {
    id: "controller",
    title: "Who controls your information",
    paragraphs: [
      "For the purposes of UK data protection law, Creed is the controller of the personal information described in this policy.",
      `If you have questions about how Creed handles personal information, you can contact ${contactEmail}.`,
    ],
  },
  {
    id: "collected-data",
    title: "What information Creed collects",
    paragraphs: [
      "Creed currently stores and processes the following categories of information as part of operating the service.",
    ],
    bullets: [
      "name",
      "email address",
      "profile picture",
      "Creed file contents",
      "onboarding answers",
      "proposal history",
      "activity history",
      "connection metadata",
      "connection tokens",
    ],
    note: "Creed does not store payment card details directly. Payments are handled by Stripe.",
  },
  {
    id: "collection",
    title: "How Creed collects information",
    bullets: [
      "directly from you when you sign in, complete onboarding, edit your Creed, manage connections, or use account features",
      "from Google Auth when basic account information is provided during sign-in, such as your name, email address, and profile image",
      "from connected agent activity when an agent reads Creed through a tokenised endpoint or submits a proposal back through a tokenised endpoint",
      "from Stripe when payment-related events need to be confirmed for billing or account administration",
    ],
    paragraphs: [
      "When you run an AI feature such as quality analysis, the relevant parts of your Creed are sent to OpenRouter to generate the result. On credits this runs on Creed's platform key; with your own key (BYOK) it runs on your key.",
    ],
  },
  {
    id: "use",
    title: "Why Creed uses information",
    paragraphs: [
      "Creed uses personal information to provide and run the service, including to create and manage accounts, authenticate users, generate and maintain Creed files, run AI features such as quality analysis, support connected agent reads and proposals, store proposal and activity history, manage tokens and connections, process payments, respond to support requests, and comply with legal obligations.",
      "Under UK GDPR, the main lawful bases Creed is likely to rely on are performance of a contract where processing is needed to provide the service you asked for, legitimate interests where processing is needed to run and secure the service in a proportionate way, and legal obligation where processing is needed to comply with applicable law.",
      "Where a specific activity depends on consent, Creed will rely on consent for that activity.",
    ],
  },
  {
    id: "agents",
    title: "Agent access and proposal endpoints",
    paragraphs: [
      "Creed provides tokenised endpoints that let connected agents interact with a user's Creed.",
    ],
    bullets: [
      "A valid read token allows an agent to read the relevant Creed payload.",
      "A valid proposal token allows an agent to submit a proposal back to Creed.",
      "Proposal submissions may include the agent name, section information, the reason for the proposed change, and draft content.",
      "Connection metadata may be recorded so Creed can show connection status and recent activity.",
    ],
    note: "These tokens are secrets and should be treated carefully. Creed stores lookup hashes and encrypted token values. Users can rotate tokens, and rotating one breaks agent connections that depend on it.",
  },
  {
    id: "sharing",
    title: "Sharing with service providers",
    paragraphs: [
      "Creed uses third-party service providers to operate the service. At the time of writing, these include Supabase for database and auth-related backend services, Vercel for hosting, Google Auth for sign-in, OpenRouter for AI features such as quality analysis, and Stripe for payments.",
      "Creed shares information with these providers only as needed to operate the service.",
      "Creed does not sell your personal information. Creed does not use your content to train models.",
    ],
  },
  {
    id: "payments",
    title: "Payments",
    paragraphs: [
      "Payments are handled by Stripe. Creed does not directly store your full payment card details.",
      "Creed may receive limited payment-related information needed to confirm payment status, manage access, and handle account administration.",
    ],
  },
  {
    id: "cookies",
    title: "Cookies and sessions",
    paragraphs: [
      "Creed currently uses only cookies or similar technologies that are necessary for core service operation, such as authentication and session handling.",
      "Creed does not currently use analytics cookies or marketing cookies.",
    ],
  },
  {
    id: "retention",
    title: "Retention",
    paragraphs: [
      "Creed keeps personal information for as long as it is reasonably needed to provide the service, maintain the account, keep proposal and activity history available to the user, and meet legal or operational requirements.",
    ],
    bullets: [
      "Account and Creed data are normally kept while your account remains active.",
      "If you ask for deletion, Creed will delete your account and associated data, subject to any limited retention that may be required for legal, security, fraud-prevention, or administrative reasons.",
      "If you want a copy of your data before deletion, you can request export first.",
    ],
  },
  {
    id: "rights",
    title: "Your rights",
    paragraphs: [
      "Depending on the circumstances, UK GDPR gives you rights over your personal information.",
    ],
    bullets: [
      "ask for access to your personal information",
      "ask for incorrect information to be corrected",
      "ask for your information to be deleted",
      "ask for export of your data",
      "object to certain processing",
      "ask for processing to be restricted",
      "withdraw consent where processing depends on consent",
    ],
    note: `To make a privacy request, contact ${contactEmail}. Creed also provides account deletion and data export functionality as part of the service.`,
  },
  {
    id: "contact",
    title: "Contact and complaints",
    paragraphs: [
      `If you have questions about this policy or how Creed handles personal information, contact ${contactEmail}.`,
      "If you are unhappy with how Creed handles your personal information, please contact Creed first so there is a chance to help.",
      "You also have the right to complain to the UK Information Commissioner's Office (ICO). Information about how to do that is available at ico.org.uk.",
    ],
  },
  {
    id: "changes",
    title: "Changes to this policy",
    paragraphs: [
      "Creed may update this Privacy Policy from time to time to reflect changes to the service, legal requirements, or how personal information is handled.",
    ],
  },
];

const openSections: PrivacySection[] = [
  {
    id: "scope",
    title: "What this notice covers",
    paragraphs: [
      "Creed Open is self-hosted software. This notice describes the data the software can process and the limited data handled by the official Creed website.",
    ],
  },
  {
    id: "controller",
    title: "Who controls your information",
    paragraphs: [
      "The person or organisation operating a Creed Open installation controls the information stored in that installation. They choose its Supabase project, hosting provider, environment, and optional integrations.",
      `Questions about the official Creed website can be sent to ${contactEmail}. Questions about a particular installation should go to its operator.`,
    ],
  },
  {
    id: "collected-data",
    title: "What an installation stores",
    bullets: [
      "Creed file contents and profile pictures",
      "onboarding answers",
      "proposal, revision, and activity history",
      "settings and connection metadata",
      "hashed and encrypted connection credentials",
    ],
    note: "Creed Open has no public accounts, managed payments, advertising, or analytics cookies by default.",
  },
  {
    id: "services",
    title: "Services chosen by the operator",
    paragraphs: [
      "Creed Open requires Supabase and can be run locally or through a hosting provider such as Vercel. Optional OpenRouter and GitHub connections send only the information needed for the feature the owner chooses to use.",
      "Those providers process information under their own terms and the operator's configuration.",
    ],
  },
  {
    id: "agents",
    title: "Agent access",
    paragraphs: [
      "Connected agents can access only the Creed and permissions granted through OAuth or a scoped token.",
    ],
    bullets: [
      "read access returns the authorised Creed payload",
      "proposal access can submit a suggested change",
      "direct-edit access can update content only where the owner allows it",
      "connection activity can be stored so the owner can review access",
    ],
  },
  {
    id: "security",
    title: "Security and owner responsibility",
    paragraphs: [
      "The owner is responsible for protecting installation secrets, keeping dependencies and migrations current, using HTTPS for public deployments, and controlling access to the connected Supabase project and hosting account.",
    ],
  },
  {
    id: "retention",
    title: "Retention and deletion",
    paragraphs: [
      "Data remains in the operator's configured services until it is deleted through Creed or those services. Creed supports Markdown export, but complete backup and deletion depend on the operator's database and storage configuration.",
    ],
  },
  {
    id: "rights",
    title: "Your rights",
    paragraphs: [
      "Privacy rights depend on the operator, location, and reason for processing. Requests about data in a self-hosted installation should be sent to its operator.",
    ],
  },
  {
    id: "contact",
    title: "Official project contact",
    paragraphs: [
      `For questions about the official Creed website or this notice, contact ${contactEmail}.`,
      "For security reports, follow the private reporting instructions in the repository Security Policy.",
    ],
  },
  {
    id: "changes",
    title: "Changes to this notice",
    paragraphs: [
      "This notice may be updated when Creed Open's default data flows or official website change.",
    ],
  },
];

export function PrivacyPageView() {
  const hostedAccounts = useCreedEdition().capabilities.hostedAccounts;
  const sections = hostedAccounts ? cloudSections : openSections;
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 20);
    }

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-[var(--creed-background)] text-[var(--creed-text-primary)]">
      <MarketingHeroBanner configured scrolled={scrolled} />

      <main className="mx-auto max-w-3xl px-6 pb-20 pt-8 md:px-10 md:pb-24 md:pt-10">
        <div className="border-b border-[var(--creed-border)] pb-8">
          <AnimatedPageTitle text="Privacy Policy" />
        </div>

        <div className="border-b border-[var(--creed-border)] pb-8 pt-8 text-[var(--creed-text-secondary)]">
          <p className="text-[16px] leading-8 md:text-[17px]">
            Creed is a service that helps people create and maintain a structured personal context
            file for use with connected AI agents. This notice explains what personal information
            Creed collects, how it is used, who it is shared with, and the choices you have under
            UK GDPR.
          </p>
        </div>

        <div className="pt-2">
          {sections.map((section) => (
            <section
              key={section.id}
              id={section.id}
              className={section.id === "changes" ? "py-8 md:py-10" : "border-b border-[var(--creed-border)] py-8 md:py-10"}
            >
              <AnimatedSectionHeading text={section.title} className="t-step" />

              <div className="mt-5 space-y-4 text-[15px] leading-8 text-[var(--creed-text-secondary)] md:text-[16px]">
                {section.paragraphs?.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>

              {section.bullets ? (
                <ol className="mt-5 list-decimal space-y-3 pl-5 text-[15px] leading-8 text-[var(--creed-text-secondary)] marker:font-medium marker:text-[var(--creed-accent)] md:text-[16px]">
                  {section.bullets.map((item) => (
                    <li key={item} className="pl-1 first-letter:uppercase">{item}</li>
                  ))}
                </ol>
              ) : null}

              {section.note ? (
                <p className="mt-5 text-[15px] leading-8 text-[var(--creed-text-primary)] md:text-[16px]">
                  {section.note}
                </p>
              ) : null}

              {section.id === "contact" ? (
                <div className="mt-6 flex flex-col gap-4 text-[15px] leading-8 text-[var(--creed-text-secondary)] md:flex-row md:items-center md:justify-between">
                  <a
                    href={`mailto:${contactEmail}`}
                    className="font-medium text-[var(--creed-accent)] transition-colors hover:text-[var(--creed-accent-hover)]"
                  >
                    {contactEmail}
                  </a>
                  <PrivacyExternalLink href="https://ico.org.uk" label="ICO guidance" />
                </div>
              ) : null}
            </section>
          ))}
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}

function PrivacyExternalLink({ href, label }: { href: string; label: string }) {
  const arrowRef = useRef<ArrowUpRightIconHandle | null>(null);
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onMouseEnter={() => arrowRef.current?.startAnimation()}
      onMouseLeave={() => arrowRef.current?.stopAnimation()}
      className="inline-flex items-center gap-2 text-[var(--creed-accent)] transition-colors hover:text-[var(--creed-accent-hover)]"
    >
      {label}
      <ArrowUpRightIcon ref={arrowRef} size={16} className="inline-flex h-4 w-4 items-center justify-center" />
    </a>
  );
}
