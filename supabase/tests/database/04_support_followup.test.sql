begin;
create extension if not exists pgtap with schema extensions;
select plan(9);
insert into auth.users(id, email) values ('22222222-2222-2222-2222-222222222222', 'support@test.local');
insert into public.support_reports(report_no, user_id, category, description, contact_email)
values ('RP20260911-ABCDEF', '22222222-2222-2222-2222-222222222222', 'other', '客服處理案件測試用問題描述', 'support@test.local');

set local role authenticated;
select throws_ok($$ select * from public.support_report_events $$, '42501', null, '會員不能直接讀取其他案件歷程');
select throws_ok($$ select public.update_support_report('RP20260911-ABCDEF', '22222222-2222-2222-2222-222222222222', 0, 'resolved', '完成', '') $$, '42501', null, '會員不能呼叫管理函式');
reset role;
set local role service_role;
select throws_ok($$ select public.update_support_report('RP20260911-ABCDEF', '22222222-2222-2222-2222-222222222222', 0, 'resolved', '', '') $$, 'P0001', 'support_invalid_update', '結案必須提供結果');
select lives_ok($$ select public.update_support_report('RP20260911-ABCDEF', '22222222-2222-2222-2222-222222222222', 0, 'resolved', '已修正，請重新載入。', '內部資訊') $$, '儲存結果');
select is((select version from public.support_reports where report_no = 'RP20260911-ABCDEF'), 1, '更新版本');
select ok((select resolved_at is not null from public.support_reports where report_no = 'RP20260911-ABCDEF'), '設定完成時間');
select throws_ok($$ select public.update_support_report('RP20260911-ABCDEF', '22222222-2222-2222-2222-222222222222', 0, 'closed', '過期更新', '') $$, 'P0001', 'support_conflict', '拒絕過期版本');
select public.update_support_report('RP20260911-ABCDEF', '22222222-2222-2222-2222-222222222222', 1, 'in_progress', '重新調查', '內部資訊');
select ok((select resolved_at is null from public.support_reports where report_no = 'RP20260911-ABCDEF'), '重新處理會清除完成時間');
select is((select count(*) from public.support_report_events where report_no = 'RP20260911-ABCDEF'), 2::bigint, '保留歷程且衝突不會寫入回覆');
reset role;
select * from finish();
rollback;
