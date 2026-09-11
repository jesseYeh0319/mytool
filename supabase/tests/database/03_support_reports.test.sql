begin;
create extension if not exists pgtap with schema extensions;

select plan(8);

insert into auth.users (id, email) values
    ('11111111-1111-1111-1111-111111111111', 'reader-a@test.local');

-- 前端完全沒有權限
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

select throws_ok(
               $$ select * from public.support_reports $$,
               '42501',
               null,
               '會員不能讀取回報'
       );

select throws_ok(
               $$ insert into public.support_reports
       (report_no, user_id, category, description, contact_email)
     values
       ('RP20260911-AAAAAA', '11111111-1111-1111-1111-111111111111',
        'other', '直接寫入資料表的測試內容', 'a@test.local') $$,
               '42501',
               null,
               '會員不能直接寫入回報'
       );

select throws_ok(
               $$ select public.create_support_report(
       '11111111-1111-1111-1111-111111111111', 'other',
       '直接呼叫建立函式的測試', 'a@test.local', null, null, null, '') $$,
               '42501',
               null,
               '會員不能繞過 API 直接呼叫建立函式'
       );

reset role;
set local role anon;

select throws_ok(
               $$ select * from public.support_reports $$,
               '42501',
               null,
               '未登入不能讀取回報'
       );

-- 以下以資料庫管理者身分執行，等同 Server API 使用的 service_role。
reset role;

create temporary table first_report as
select * from public.create_support_report(
        '11111111-1111-1111-1111-111111111111', 'content',
        '第一章第三段有錯字需要修正', 'a@test.local',
        'my-novel', 'chapter-01', null, 'test-agent'
              );

select ok(
               (select report_number ~ '^RP[0-9]{8}-[0-9A-F]{6}$' and not is_duplicate
                   from first_report),
  '建立回報並產生編號'
);

select is(
    (select report_number
    from public.create_support_report(
    '11111111-1111-1111-1111-111111111111', 'content',
    '第一章第三段有錯字需要修正', 'a@test.local',
    'my-novel', 'chapter-01', null, 'test-agent'
    )
    where is_duplicate),
    (select report_number from first_report),
    '10 分鐘內重複送出相同內容，回傳原本的編號'
    );

select throws_ok(
               $$ select * from public.create_support_report(
       '11111111-1111-1111-1111-111111111111', 'reading',
       '書籤跳轉位置不對需要檢查', 'a@test.local',
       null, null, null, 'test-agent') $$,
               'P0001',
               'support_report_cooldown',
               '60 秒內送出不同內容會被擋下'
       );

-- 模擬 24 小時內已經送出 10 筆，而且都在 60 秒冷卻之外。
delete from public.support_reports;

insert into public.support_reports
(report_no, user_id, category, description, contact_email, created_at)
select
    'RP20260911-' || upper(lpad(to_hex(n), 6, '0')),
    '11111111-1111-1111-1111-111111111111',
    'other',
    '模擬的第 ' || n || ' 筆回報內容',
    'a@test.local',
    now() - (n || ' hours')::interval
from generate_series(1, 10) as n;

select throws_ok(
               $$ select * from public.create_support_report(
       '11111111-1111-1111-1111-111111111111', 'other',
       '第十一筆回報應該被擋下', 'a@test.local',
       null, null, null, 'test-agent') $$,
               'P0001',
               'support_report_daily_limit',
               '24 小時內超過 10 筆會被擋下'
       );

select * from finish();
rollback;