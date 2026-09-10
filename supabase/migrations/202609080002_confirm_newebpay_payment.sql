/*
 * 藍新付款成功後，一次完成「訂單轉為已付款」與「開通章節權限」。
 *
 * 只有 service_role 能執行，
 * 由 server/api/payments/notify.post.ts 與 verify.post.ts 呼叫。
 *
 * 這個函式必須是冪等的：
 * 藍新會重送通知，而 verify 也可能查到同一筆成功交易。
 */

begin;

create or replace function public.confirm_newebpay_payment(
    p_order_no text,
    p_trade_no text,
    p_amount integer
)
    returns void
    language plpgsql
    set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
begin
  if p_order_no is null
     or btrim(p_order_no) = ''
     or p_trade_no is null
     or btrim(p_trade_no) = ''
     or p_amount is null
     or p_amount <= 0 then
    raise exception 'Invalid payment parameters';
  end if;

  -- 鎖住訂單，避免同一筆通知同時被重複處理。
  select *
  into v_order
  from public.orders
  where order_no = p_order_no
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if v_order.payment_provider is distinct from 'newebpay'
     or v_order.currency is distinct from 'TWD'
     or v_order.amount is distinct from p_amount then
    raise exception 'Payment does not match order';
  end if;

  -- 同一訂單不能對應不同的藍新交易編號。
  if v_order.provider_payment_id is not null
     and v_order.provider_payment_id <> p_trade_no then
    raise exception 'Payment transaction mismatch';
  end if;

  if v_order.status = 'paid' then
    if v_order.provider_payment_id is distinct from p_trade_no then
      raise exception 'Payment transaction mismatch';
    end if;

    -- 相同的成功通知已處理，直接結束。
    return;
  end if;

  -- cancelled 目前代表本地逾時。
  -- 如果之後收到經驗證的成功通知，仍須承認實際付款。
  if v_order.status not in ('pending', 'cancelled') then
    raise exception 'Order status cannot accept payment';
  end if;

  -- 同一會員、同一章節的付款解鎖依序處理。
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'chapter-access:'
      || v_order.user_id::text || ':'
      || v_order.book_slug || ':'
      || v_order.chapter_slug,
      0
    )
  );

  insert into public.chapter_access (
    user_id,
    book_slug,
    chapter_slug
  )
  select
    v_order.user_id,
    v_order.book_slug,
    v_order.chapter_slug
  where not exists (
    select 1
    from public.chapter_access
    where user_id = v_order.user_id
      and book_slug = v_order.book_slug
      and chapter_slug = v_order.chapter_slug
  );

  update public.orders
  set
    status = 'paid',
    provider_payment_id = p_trade_no,
    paid_at = now()
  where id = v_order.id;
end;
$$;

revoke execute on function public.confirm_newebpay_payment(text, text, integer)
    from public, anon, authenticated;

grant execute on function public.confirm_newebpay_payment(text, text, integer)
    to service_role;

commit;
