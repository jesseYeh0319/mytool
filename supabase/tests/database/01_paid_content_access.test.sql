begin;
create extension if not exists pgtap with schema extensions;

select plan(6);

-- 測試帳號：A 買過第 2 章，B 沒買。
insert into auth.users (id, email) values
                                       ('11111111-1111-1111-1111-111111111111', 'reader-a@test.local'),
                                       ('22222222-2222-2222-2222-222222222222', 'reader-b@test.local');

insert into public.paid_chapter_content (book_slug, chapter_slug, body)
values ('my-novel', 'chapter-02', 'PAIDBODYCHECK');

insert into public.chapter_access (user_id, book_slug, chapter_slug)
values ('11111111-1111-1111-1111-111111111111', 'my-novel', 'chapter-02');

-- 以 A 的身分
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

select results_eq(
               $$ select body from public.paid_chapter_content
     where book_slug = 'my-novel' and chapter_slug = 'chapter-02' $$,
               $$ values ('PAIDBODYCHECK'::text) $$,
               '已購買的會員讀得到付費正文'
       );

-- 以 B 的身分
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

select is_empty(
               $$ select body from public.paid_chapter_content $$,
               '沒買的會員讀不到付費正文'
       );

select is_empty(
               $$ select 1 from public.chapter_access $$,
               '會員看不到別人的購買紀錄'
       );

select throws_ok(
               $$ insert into public.chapter_access (user_id, book_slug, chapter_slug)
     values ('22222222-2222-2222-2222-222222222222', 'my-novel', 'chapter-02') $$,
               '42501',
               null,
               '會員不能自己開通閱讀權限'
       );

select throws_ok(
               $$ insert into public.orders
       (user_id, order_no, book_slug, chapter_slug, amount, status, payment_provider)
     values
       ('22222222-2222-2222-2222-222222222222', 'MYBBFAKE0001',
        'my-novel', 'chapter-02', 30, 'paid', 'newebpay') $$,
               '42501',
               null,
               '會員不能自己建立已付款訂單'
       );

-- 未登入
reset role;
set local role anon;

select is_empty(
               $$ select body from public.paid_chapter_content $$,
               '未登入讀不到付費正文'
       );

select * from finish();
rollback;