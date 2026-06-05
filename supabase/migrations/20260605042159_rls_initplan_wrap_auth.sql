-- Performance: wrap bare auth.uid()/auth.role() calls in RLS policies in a
-- scalar subselect so Postgres evaluates them once per query (InitPlan) instead
-- of once per row. Clears the `auth_rls_initplan` advisor across all public
-- tables. Generated programmatically from pg_policies; idempotent via the
-- already-wrapped guard, so it is safe to replay (e.g. `supabase db reset`).
do $$
declare
  r record;
  new_qual text;
  new_check text;
  roles_csv text;
begin
  for r in select * from pg_policies where schemaname = 'public' loop
    -- idempotency guard: skip policies whose expressions are already wrapped
    if coalesce(r.qual,'') like '%(select auth.uid())%'
       or coalesce(r.with_check,'') like '%(select auth.uid())%'
       or coalesce(r.qual,'') like '%(select auth.role())%'
       or coalesce(r.with_check,'') like '%(select auth.role())%' then
      continue;
    end if;

    new_qual := replace(replace(coalesce(r.qual,''),
      'auth.uid()','(select auth.uid())'),
      'auth.role()','(select auth.role())');
    new_check := replace(replace(coalesce(r.with_check,''),
      'auth.uid()','(select auth.uid())'),
      'auth.role()','(select auth.role())');
    roles_csv := array_to_string(r.roles, ', ');

    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
    execute format('create policy %I on public.%I as %s for %s to %s%s%s',
      r.policyname, r.tablename, r.permissive, r.cmd, roles_csv,
      case when r.qual is not null then ' using (' || new_qual || ')' else '' end,
      case when r.with_check is not null then ' with check (' || new_check || ')' else '' end
    );
  end loop;
end $$;
