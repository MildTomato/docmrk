-- Feedback belongs to an organization, even when multiple organizations save the same post.
set local lock_timeout = '5s';

alter table public.feedback
  drop constraint feedback_identifier_id_key,
  add constraint feedback_organization_source_identifier_key
    unique (organization_id, source, identifier_id);

alter table public.feedback enable row level security;

-- Replace either deployed policy baseline. Permissive policies combine with OR,
-- so an older INSERT policy must not survive and bypass the author check below.
drop policy if exists "Anyone can select" on public.feedback;
drop policy if exists "ALLOW INSERT FOR ANYONE" on public.feedback;
drop policy if exists "Org owners can select feedback" on public.feedback;
drop policy if exists "Org owners can insert feedback" on public.feedback;
drop policy if exists "Organization owners can read feedback" on public.feedback;
drop policy if exists "Organization owners can capture feedback" on public.feedback;

create policy "Organization owners can read feedback"
  on public.feedback for select to authenticated
  using (
    organization_id in (
      select id from public.organizations
      where inserted_by = (select auth.uid())
    )
  );

create policy "Organization owners can capture feedback"
  on public.feedback for insert to authenticated
  with check (
    inserted_by = (select auth.uid())
    and organization_id in (
      select id from public.organizations
      where inserted_by = (select auth.uid())
    )
  );
