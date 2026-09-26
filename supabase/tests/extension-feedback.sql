begin;

-- Run against the existing Docmrk schema. Fixtures and writes roll back.
do $$
declare
  owner_id uuid;
  first_org uuid := gen_random_uuid();
  second_org uuid := gen_random_uuid();
  post_id text := 'docmrk-regression-' || gen_random_uuid()::text;
  row_count integer;
begin
  select inserted_by into strict owner_id from public.organizations limit 1;
  insert into public.organizations (id, name, inserted_by)
    values (first_org, 'Docmrk regression A', owner_id),
           (second_org, 'Docmrk regression B', owner_id);

  perform set_config('request.jwt.claims', json_build_object('sub',owner_id,'role','authenticated')::text, true);
  execute 'set local role authenticated';

  insert into public.feedback (id, organization_id, source, identifier_id, inserted_by)
    overriding system value
    values (-900000000001, first_org, 'TWITTER', post_id, owner_id),
           (-900000000002, second_org, 'TWITTER', post_id, owner_id);
  select count(*) into row_count from public.feedback where identifier_id = post_id;
  if row_count <> 2 then raise exception 'Owner cannot read captures in both organizations'; end if;

  begin
    insert into public.feedback (id, organization_id, source, identifier_id, inserted_by)
      overriding system value values (-900000000003, first_org, 'TWITTER', post_id, owner_id);
    raise exception 'Duplicate capture was accepted';
  exception when unique_violation then null;
  end;

  perform set_config('request.jwt.claims', json_build_object('sub',gen_random_uuid(),'role','authenticated')::text, true);
  select count(*) into row_count from public.feedback where identifier_id = post_id;
  if row_count <> 0 then raise exception 'Another account can read feedback'; end if;

  begin
    insert into public.feedback (id, organization_id, source, identifier_id, inserted_by)
      overriding system value values (-900000000003, first_org, 'TWITTER', post_id || '-other', owner_id);
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
