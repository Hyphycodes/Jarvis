-- Security: is_app_owner / is_demo_visible_user are SECURITY DEFINER helpers that
-- were executable by anon via PostgREST (granted to PUBLIC + anon). They are only
-- referenced by authenticated-role policies, so revoke from PUBLIC and anon while
-- keeping authenticated (RLS evaluation needs EXECUTE) and service_role.
revoke execute on function public.is_app_owner(uuid)        from public;
revoke execute on function public.is_app_owner(uuid)        from anon;
revoke execute on function public.is_demo_visible_user(uuid) from public;
revoke execute on function public.is_demo_visible_user(uuid) from anon;
