-- Unifies the section data model around a single rich-text kind.
-- Wipes existing section/proposal/activity rows for every user (the small
-- private user base has accepted this trade-off in exchange for a clean
-- rebuild).

-- Single truncate with CASCADE so FK chains (creed_activity → creed_proposals)
-- don't block the rebuild. CASCADE only walks INTO these three tables since
-- nothing outside this set references them.
truncate table
  public.creed_sections,
  public.creed_proposals,
  public.creed_activity
cascade;

alter table public.creed_sections
  add column if not exists agent_writable boolean not null default false,
  add column if not exists template text not null default 'freeform';

create index if not exists creed_sections_template_idx
  on public.creed_sections (template);
