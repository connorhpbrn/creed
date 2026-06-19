// Transition skeleton for /settings. Mirrors the real screen 1:1: heading then
// labelled sections separated by my-10 dividers - Profile (two label + input
// fields), Agent edit behaviour (label/description + control row + per-section
// toggle), Integrations (icon + label + button rows), and AI (fields). Uses the
// same max-w-3xl container, paddings, radii, and element sizes as the source.
import type { ReactNode } from "react";

function Block({ className }: { className?: string }) {
  return <div className={`rounded-[6px] bg-[var(--creed-surface-raised)] ${className ?? ""}`} />;
}

function Card({ children }: { children?: ReactNode }) {
  return (
    <div className="mt-4 rounded-[var(--radius-xl)] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-5">
      {children}
    </div>
  );
}

function Divider() {
  return <div className="my-10 h-px bg-[var(--creed-border)]" />;
}

function Field({ labelWidth = "w-28" }: { labelWidth?: string }) {
  return (
    <div>
      <Block className={`mb-2 h-3.5 ${labelWidth}`} />
      <Block className="h-11 w-full rounded-xl" />
    </div>
  );
}

export default function SettingsLoading() {
  return (
    <div className="h-full overflow-hidden bg-[var(--creed-surface)]" aria-hidden="true">
      <div className="mx-auto max-w-3xl px-8 py-10 md:px-14">
        <div className="animate-pulse">
          {/* Page heading */}
          <Block className="h-7 w-32" />

          {/* Profile */}
          <section className="mt-10">
            <Block className="h-4 w-16" />
            <Card>
              <div className="space-y-3">
                <Field labelWidth="w-28" />
                <Field labelWidth="w-12" />
              </div>
            </Card>
          </section>

          <Divider />

          {/* Agent edit behaviour */}
          <section>
            <Block className="h-4 w-44" />
            <Card>
              <div className="flex items-start justify-between gap-5">
                <div className="min-w-0">
                  <Block className="h-4 w-24" />
                  <Block className="mt-2.5 h-3.5 w-72 max-w-full" />
                </div>
                <Block className="h-8 w-40 shrink-0 rounded-md" />
              </div>
              <div className="mt-5 border-t border-[var(--creed-border)] pt-4">
                <div className="flex items-center justify-between">
                  <Block className="h-4 w-44" />
                  <Block className="h-4 w-4" />
                </div>
              </div>
            </Card>
          </section>

          <Divider />

          {/* Integrations */}
          <section>
            <Block className="h-4 w-28" />
            <Card>
              <div className="space-y-4">
                {[0, 1].map((i) => (
                  <div key={i} className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <Block className="h-9 w-9 rounded-[8px]" />
                      <div>
                        <Block className="h-4 w-24" />
                        <Block className="mt-2 h-3 w-36" />
                      </div>
                    </div>
                    <Block className="h-8 w-24 rounded-md" />
                  </div>
                ))}
              </div>
            </Card>
          </section>

          <Divider />

          {/* AI */}
          <section>
            <Block className="h-4 w-8" />
            <Card>
              <Field labelWidth="w-24" />
              <div className="mt-4">
                <Field labelWidth="w-16" />
              </div>
            </Card>
          </section>
        </div>
      </div>
    </div>
  );
}
