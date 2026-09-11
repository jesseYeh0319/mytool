BEGIN;

ALTER TABLE public.tech_comments
    ADD COLUMN IF NOT EXISTS ip_label text NOT NULL DEFAULT '未記錄';

CREATE TABLE IF NOT EXISTS public.tech_comment_private_ips (
                                                               comment_id uuid PRIMARY KEY
                                                               REFERENCES public.tech_comments(id) ON DELETE CASCADE,

    ip_address inet NOT NULL
    CHECK (
              masklen(ip_address) =
    CASE
    WHEN family(ip_address) = 4 THEN 32
    ELSE 128
    END
    )
    );

ALTER TABLE public.tech_comment_private_ips
    ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.tech_comment_private_ips
    FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, DELETE
    ON public.tech_comment_private_ips
    TO service_role;

CREATE OR REPLACE FUNCTION public.create_tech_comment_with_ip(
    p_article_slug text,
    p_nickname text,
    p_content text,
    p_ip_hash text,
    p_ip_address inet,
    p_is_local boolean
)
RETURNS TABLE (
    comment_id uuid,
    is_duplicate boolean
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
v_id uuid;
    v_duplicate boolean;
    v_label text;
    v_host text;
    v_expected_mask integer;
BEGIN
    IF p_is_local IS NULL THEN
        RAISE EXCEPTION 'comment_invalid_input';
END IF;

    IF p_is_local THEN
        IF p_ip_address IS NOT NULL THEN
            RAISE EXCEPTION 'comment_invalid_input';
END IF;

        v_label := '本機測試';
ELSE
        IF p_ip_address IS NULL THEN
            RAISE EXCEPTION 'comment_invalid_input';
END IF;

        IF pg_catalog.family(p_ip_address) = 4 THEN
            v_expected_mask := 32;
ELSE
            v_expected_mask := 128;
END IF;

        IF pg_catalog.masklen(p_ip_address) <> v_expected_mask THEN
            RAISE EXCEPTION 'comment_invalid_input';
END IF;

        v_host := pg_catalog.host(p_ip_address);

        IF pg_catalog.family(p_ip_address) = 4 THEN
            v_label :=
                pg_catalog.split_part(v_host, '.', 1) || '.' ||
                pg_catalog.split_part(v_host, '.', 2) || '.' ||
                pg_catalog.split_part(v_host, '.', 3) || '.*';
ELSE
            v_label :=
                pg_catalog.network(
                    pg_catalog.set_masklen(p_ip_address, 48)
                )::text || '（遮罩）';
END IF;
END IF;

SELECT r.comment_id, r.is_duplicate
INTO v_id, v_duplicate
FROM public.create_tech_comment(
             p_article_slug,
             p_nickname,
             p_content,
             p_ip_hash
     ) AS r;

IF NOT v_duplicate THEN
UPDATE public.tech_comments
SET ip_label = v_label
WHERE id = v_id;

IF NOT p_is_local THEN
            INSERT INTO public.tech_comment_private_ips (
                comment_id,
                ip_address
            )
            VALUES (
                v_id,
                p_ip_address
            );
END IF;
END IF;

RETURN QUERY SELECT v_id, v_duplicate;
END;
$function$;

REVOKE ALL
    ON FUNCTION public.create_tech_comment_with_ip(
    text, text, text, text, inet, boolean
    )
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.create_tech_comment_with_ip(
        text, text, text, text, inet, boolean
    )
    TO service_role;

COMMIT;

-- 執行成功後，以下三個結果都應為 true。
SELECT
    EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'tech_comments'
          AND column_name = 'ip_label'
    ) AS ip_label_ready,

    to_regclass(
            'public.tech_comment_private_ips'
    ) IS NOT NULL AS private_ip_table_ready,

    to_regprocedure(
            'public.create_tech_comment_with_ip(text,text,text,text,inet,boolean)'
    ) IS NOT NULL AS create_function_ready;