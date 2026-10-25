-- Optional triage hints on content_reports for future human review.
-- Rules-based only; never used for automatic penalties.
-- Authenticated users still have no SELECT on content_reports.

alter table public.content_reports
  add column if not exists triage_hints text[] not null default '{}';

alter table public.content_reports
  add column if not exists triage_engine text;

comment on column public.content_reports.triage_hints is
  'Soft keyword triage hints for reviewers. Not a definitive judgment. Never auto-enforce.';
comment on column public.content_reports.triage_engine is
  'deterministic-rules | unavailable — never claim LLM when rules were used.';

-- Harden grants: authenticated may INSERT only; no SELECT/UPDATE/DELETE.
revoke all on table public.content_reports from anon;
revoke select, update, delete on table public.content_reports from authenticated;
grant insert on table public.content_reports to authenticated;
