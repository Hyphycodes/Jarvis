alter function public.tg_set_updated_at() set search_path = '';
revoke execute on function public.seed_founder(text)        from anon, authenticated, public;
revoke execute on function public.seed_founder_for(uuid)    from anon, authenticated, public;
revoke execute on function public.tg_handle_new_auth_user() from anon, authenticated, public;
