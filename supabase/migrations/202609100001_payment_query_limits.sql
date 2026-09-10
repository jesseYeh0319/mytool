begin;

create table public.payment_query_limits (
                                             user_id uuid primary key
                                                 references auth.users(id) on delete cascade,

                                             next_allowed_at timestamptz not null
);

alter table public.payment_query_limits
    enable row level security;

revoke all on table public.payment_query_limits
    from public, anon, authenticated;

grant select, insert, update
    on table public.payment_query_limits
    to service_role;

create function public.claim_payment_query(
    p_user_id uuid
)
    returns boolean
    language plpgsql
security invoker
set search_path = ''
as $$
declare
v_now timestamptz := clock_timestamp();
  v_count integer;
begin
  if p_user_id is null then
    raise exception 'User ID is required';
end if;

insert into public.payment_query_limits as limits (
    user_id,
    next_allowed_at
  )
values (
    p_user_id,
    v_now + interval '30 seconds'
    )
on conflict (user_id)
    do update
           set next_allowed_at = excluded.next_allowed_at
       where limits.next_allowed_at <= v_now;

get diagnostics v_count = row_count;

return v_count = 1;
end;
$$;

revoke execute on function public.claim_payment_query(uuid)
    from public, anon, authenticated;

grant execute on function public.claim_payment_query(uuid)
to service_role;

commit;