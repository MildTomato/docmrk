begin;

-- Run after the extension migration on a Docmrk schema, including an empty one.
-- Users, reference data, organizations, and captures are fixtures that roll back.
do $$
declare
  owner_id uuid := gen_random_uuid();
  outsider_id uuid := gen_random_uuid();
  first_org uuid := gen_random_uuid();
  second_org uuid := gen_random_uuid();
  post_id text := 'docmrk-regression-' || gen_random_uuid()::text;
  source_id bigint;
  feedback_id_base bigint;
  row_count integer;
begin
  insert into auth.users (id, aud, role, email)
    values (owner_id, 'authenticated', 'authenticated', 'docmrk-owner-' || owner_id::text || '@example.invalid'),
           (outsider_id, 'authenticated', 'authenticated', 'docmrk-outsider-' || outsider_id::text || '@example.invalid');

  -- Explicit IDs avoid advancing identity sequences, which rollback cannot undo.
  select least(coalesce(min(id), 0), 0) - 1 into source_id from public.sources;
  insert into public.sources (id, key, label) overriding system value
    select source_id, 'TWITTER', 'Twitter'
    where not exists (select 1 from public.sources where key = 'TWITTER');
  select least(coalesce(min(id), 0), 0) - 3 into feedback_id_base from public.feedback;

  insert into public.organizations (id, name, inserted_by)
    values (first_org, 'Docmrk regression ' || first_org::text, owner_id),
           (second_org, 'Docmrk regression ' || second_org::text, owner_id);

  perform set_config('request.jwt.claims', json_build_object('sub',owner_id,'role','authenticated')::text, true);
  execute 'set local role authenticated';

  insert into public.feedback (id, organization_id, source, identifier_id, inserted_by)
    overriding system value
    values (feedback_id_base, first_org, 'TWITTER', post_id, owner_id),
           (feedback_id_base + 1, second_org, 'TWITTER', post_id, owner_id);
  select count(*) into row_count from public.feedback where identifier_id = post_id;
  if row_count <> 2 then raise exception 'Owner cannot read captures in both organizations'; end if;

  begin
    insert into public.feedback (id, organization_id, source, identifier_id, inserted_by)
      overriding system value values (feedback_id_base + 2, first_org, 'TWITTER', post_id, owner_id);
    raise exception 'Duplicate capture was accepted';
  exception when unique_violation then null;
  end;

  begin
    insert into public.feedback (id, organization_id, source, identifier_id, inserted_by)
      overriding system value values (feedback_id_base + 2, first_org, 'TWITTER', post_id || '-forged-owner', outsider_id);
    raise exception 'An owner can forge the capture author';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claims', json_build_object('sub',outsider_id,'role','authenticated')::text, true);
  select count(*) into row_count from public.feedback where identifier_id = post_id;
  if row_count <> 0 then raise exception 'Another account can read feedback'; end if;

  begin
    insert into public.feedback (id, organization_id, source, identifier_id, inserted_by)
      overriding system value values (feedback_id_base + 2, first_org, 'TWITTER', post_id || '-other', outsider_id);
    raise exception 'Another account can write to an organization';
  exception when insufficient_privilege then null;
  end;

  execute 'set local role anon';
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  select count(*) into row_count from public.feedback;
  if row_count <> 0 then raise exception 'Signed-out users can read feedback'; end if;

  execute 'reset role';
end;
$$;

rollback;
