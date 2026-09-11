# Supabase 結構管理

## 檔案說明

| 檔案 | 用途 |
|---|---|
| `migrations/202609080001_baseline_schema.sql` | 四張表、RLS 與 policy 的基準檔 |
| `migrations/202609080002_confirm_newebpay_payment.sql` | 付款成功後轉單並開通權限的函式 |
| `migrations/202609100001_payment_query_limits.sql` | 主動查詢付款的 30 秒節流 |
| `schema.sql` | `supabase db dump` 的快照，僅供對照，不會被套用 |

前兩份是**事後補的基準檔**，用來記錄 2026-09-10 當下正式環境已經存在的結構，
不是逐次演進的紀錄。之後的異動請一律新增檔案，不要改這兩份。

## 客服回報後續處理

部署前依序套用 `202609110001_support_reports.sql` 與
`202609110002_support_followup.sql`（已套用的版本不用重跑）。
會員入口是 `/my-reports`，管理入口是 `/admin/support`。
所有查詢經伺服器驗證登入；會員只能讀取自己的案件，內部備註不會傳給會員。

管理者資格採用 Supabase Auth 的 `app_metadata.support_admin: true`。
請由可信任的管理環境使用 Auth Admin API 的 `updateUserById` 設定，保留既有
app metadata；不要放進可由會員修改的 `user_metadata`。移除資格可設為 `false`。
伺服器每次請求都向 Auth 重新確認資格。管理者可從「我的回報」進入管理頁。

客服回覆保存在站內，不會自動寄送電子郵件。結案／已解決必須附公開處理結果；
再次設為待處理／處理中會清除完成時間，歷史回覆仍保留。
版本衝突時重新載入案件再處理，避免覆蓋他人的更新。

執行 `supabase test db` 可驗證資料庫權限、回覆與版本衝突。

## Migration 命名規則

沿用 `YYYYMMDDNNNN` 的 12 位數格式（例：`202609100001`）。

**不要混用 Supabase CLI 預設的 14 位數格式**，兩種混在一起排序會錯亂：
字串比較下 `202609100001` 會排在 `20260908000001` 前面。
用 `supabase migration new` 產生的檔案要手動把版本號改成 12 位數。

## 新環境重建

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push
```

## 既有環境（結構已經存在）

兩份 baseline（`202609080001`、`202609080002`）寫成可重複執行的形式，重跑不會出錯。

**但 `202609100001` 不是** —— 它用的是 `create table` / `create function`，
對已經有那些物件的資料庫執行會噴
`relation "payment_query_limits" already exists`。

所以對既有環境**不要直接 push**。先確認遠端的
`supabase_migrations.schema_migrations` 有沒有版本紀錄：

```bash
npx supabase migration list
```

若遠端結構已經是最新、只是缺紀錄，逐一標記為已套用：

```bash
npx supabase migration repair --status applied 202609080001
```

```bash
npx supabase migration repair --status applied 202609080002
```

```bash
npx supabase migration repair --status applied 202609100001
```

## 重新產生快照

結構有異動後更新對照用的 `schema.sql`（需要 Docker Desktop 運作中）：

```bash
npx supabase db dump --schema public -f supabase/schema.sql
```

## 驗證 migration

不需要跑整套 `supabase start`。起一個裸 Postgres、補上 `auth` schema 的最小替身，
再依序套用即可驗證語法與相依順序：

```bash
docker run -d --name mig-check -e POSTGRES_PASSWORD=x -e POSTGRES_DB=app postgres:15-alpine
```

替身需要建立 `anon` / `authenticated` / `service_role` 三個 role、
`auth.users` 表與 `auth.uid()` 函式，之後再逐一 `psql -f` 套用 migrations。
驗完記得 `docker rm -f mig-check`。

## 未納入版控的物件

`public.rls_auto_enable()` 出現在 dump 裡，但**沒有**收進 migrations。
它是 Supabase 平台用來自動對新表開啟 RLS 的機制，
而且對應的 event trigger 是叢集層級物件，`--schema public` 的 dump 抓不到。
在 migrations 裡重建只會得到一個沒有觸發器的孤兒函式。

**副作用**：在自架的 PostgreSQL 上套用這些 migration 時，新表不會自動開啟 RLS。
本專案的四張表都在 baseline 裡明確寫了 `enable row level security`，所以不受影響，
但日後新增表時要記得自己加。
