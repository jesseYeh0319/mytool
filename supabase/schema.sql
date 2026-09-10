


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."claim_payment_query"("p_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."claim_payment_query"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_newebpay_payment"("p_order_no" "text", "p_trade_no" "text", "p_amount" integer) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."confirm_newebpay_payment"("p_order_no" "text", "p_trade_no" "text", "p_amount" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."chapter_access" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "book_slug" "text" NOT NULL,
    "chapter_slug" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."chapter_access" OWNER TO "postgres";


ALTER TABLE "public"."chapter_access" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."chapter_access_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "order_no" "text" NOT NULL,
    "book_slug" "text" NOT NULL,
    "chapter_slug" "text" NOT NULL,
    "amount" integer NOT NULL,
    "currency" "text" DEFAULT 'TWD'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "payment_provider" "text",
    "provider_payment_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "paid_at" timestamp with time zone
);


ALTER TABLE "public"."orders" OWNER TO "postgres";


ALTER TABLE "public"."orders" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."orders_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."paid_chapter_content" (
    "id" bigint NOT NULL,
    "book_slug" "text" NOT NULL,
    "chapter_slug" "text" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."paid_chapter_content" OWNER TO "postgres";


ALTER TABLE "public"."paid_chapter_content" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."paid_chapter_content_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."payment_query_limits" (
    "user_id" "uuid" NOT NULL,
    "next_allowed_at" timestamp with time zone NOT NULL
);


ALTER TABLE "public"."payment_query_limits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reading_progress" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "book_slug" "text" NOT NULL,
    "chapter_slug" "text" NOT NULL,
    "progress" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."reading_progress" OWNER TO "postgres";


ALTER TABLE "public"."reading_progress" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."reading_progress_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE ONLY "public"."chapter_access"
    ADD CONSTRAINT "chapter_access_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chapter_access"
    ADD CONSTRAINT "chapter_access_user_id_book_slug_chapter_slug_key" UNIQUE ("user_id", "book_slug", "chapter_slug");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_order_no_key" UNIQUE ("order_no");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."paid_chapter_content"
    ADD CONSTRAINT "paid_chapter_content_book_slug_chapter_slug_key" UNIQUE ("book_slug", "chapter_slug");



ALTER TABLE ONLY "public"."paid_chapter_content"
    ADD CONSTRAINT "paid_chapter_content_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_query_limits"
    ADD CONSTRAINT "payment_query_limits_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."reading_progress"
    ADD CONSTRAINT "reading_progress_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reading_progress"
    ADD CONSTRAINT "reading_progress_user_id_book_slug_key" UNIQUE ("user_id", "book_slug");



ALTER TABLE ONLY "public"."chapter_access"
    ADD CONSTRAINT "chapter_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_query_limits"
    ADD CONSTRAINT "payment_query_limits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reading_progress"
    ADD CONSTRAINT "reading_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Users can insert own reading progress" ON "public"."reading_progress" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own chapter access" ON "public"."chapter_access" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own orders" ON "public"."orders" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own reading progress" ON "public"."reading_progress" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read purchased chapter content" ON "public"."paid_chapter_content" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."chapter_access"
  WHERE (("chapter_access"."user_id" = "auth"."uid"()) AND ("chapter_access"."book_slug" = "paid_chapter_content"."book_slug") AND ("chapter_access"."chapter_slug" = "paid_chapter_content"."chapter_slug")))));



CREATE POLICY "Users can update own reading progress" ON "public"."reading_progress" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."chapter_access" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."paid_chapter_content" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payment_query_limits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reading_progress" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_payment_query"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_payment_query"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."confirm_newebpay_payment"("p_order_no" "text", "p_trade_no" "text", "p_amount" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."confirm_newebpay_payment"("p_order_no" "text", "p_trade_no" "text", "p_amount" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON TABLE "public"."chapter_access" TO "anon";
GRANT ALL ON TABLE "public"."chapter_access" TO "authenticated";
GRANT ALL ON TABLE "public"."chapter_access" TO "service_role";



GRANT ALL ON SEQUENCE "public"."chapter_access_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."chapter_access_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."chapter_access_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."orders" TO "anon";
GRANT ALL ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";



GRANT ALL ON SEQUENCE "public"."orders_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."orders_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."orders_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."paid_chapter_content" TO "anon";
GRANT ALL ON TABLE "public"."paid_chapter_content" TO "authenticated";
GRANT ALL ON TABLE "public"."paid_chapter_content" TO "service_role";



GRANT ALL ON SEQUENCE "public"."paid_chapter_content_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."paid_chapter_content_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."paid_chapter_content_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."payment_query_limits" TO "service_role";



GRANT ALL ON TABLE "public"."reading_progress" TO "anon";
GRANT ALL ON TABLE "public"."reading_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."reading_progress" TO "service_role";



GRANT ALL ON SEQUENCE "public"."reading_progress_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."reading_progress_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."reading_progress_id_seq" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







