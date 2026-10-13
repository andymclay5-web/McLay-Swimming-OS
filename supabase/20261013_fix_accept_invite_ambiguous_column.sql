-- 13 Oct 2026: Jordan's join failed with "column reference organisation_id is ambiguous".
-- These functions RETURN TABLE(organisation_id ...) and also use ON CONFLICT (organisation_id, user_id),
-- so plpgsql could not tell the output column from the table column. Applied live via MCP.
do $$
declare f regprocedure; d text;
begin
  foreach f in array array['public.mclay_accept_assistant_invite(text)','public.mclay_accept_swimmer_invite(text)','public.mclay_decide_swimmer_link_request(uuid,boolean)']::regprocedure[] loop
    d := pg_get_functiondef(f);
    if position('#variable_conflict' in d)=0 then
      d := replace(d, 'AS $function$', E'AS $function$\n#variable_conflict use_column');
      execute d;
    end if;
  end loop;
end $$;
