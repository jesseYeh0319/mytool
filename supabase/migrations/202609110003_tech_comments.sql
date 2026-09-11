BEGIN;

CREATE TABLE public.tech_comments (
                                      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

                                      article_slug text NOT NULL
                                          CHECK (
                                              char_length(article_slug) <= 160
                                                  AND article_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
),

    nickname text NOT NULL
        CHECK (char_length(btrim(nickname)) BETWEEN 1 AND 30),

    content text NOT NULL
        CHECK (char_length(btrim(content)) BETWEEN 2 AND 1000),

    -- 只保存伺服器產生的 IP 雜湊，不保存原始 IP。
    ip_hash text NOT NULL
        CHECK (ip_hash ~ '^[0-9a-f]{64}$'),

    status text NOT NULL DEFAULT 'published'
        CHECK (status IN ('published', 'hidden')),

    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX tech_comments_article_created_idx
    ON public.tech_comments(article_slug, created_at DESC, id DESC)
    WHERE status = 'published';

CREATE INDEX tech_comments_ip_created_idx
    ON public.tech_comments(ip_hash, created_at DESC);

ALTER TABLE public.tech_comments ENABLE ROW LEVEL SECURITY;

-- 所有存取都經過伺服器，訪客不能直接操作資料表。
REVOKE ALL ON public.tech_comments
    FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
    ON public.tech_comments
    TO service_role;

CREATE FUNCTION public.create_tech_comment(
    p_article_slug text,
    p_nickname text,
    p_content text,
    p_ip_hash text
)
    RETURNS TABLE (
                      comment_id uuid,
                      is_duplicate boolean
                  )
    LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
v_now timestamptz;
    v_existing uuid;
    v_id uuid;
BEGIN
    IF p_ip_hash IS NULL
       OR p_ip_hash !~ '^[0-9a-f]{64}$'
       OR p_article_slug IS NULL
       OR char_length(p_article_slug) > 160
       OR p_article_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
       OR p_nickname IS NULL
       OR char_length(btrim(p_nickname)) NOT BETWEEN 1 AND 30
       OR p_content IS NULL
       OR char_length(btrim(p_content)) NOT BETWEEN 2 AND 1000
    THEN
        RAISE EXCEPTION 'comment_invalid_input';
END IF;

    -- 同一 IP 依序檢查，避免同時送出多筆繞過限制。
    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('tech-comment:' || p_ip_hash, 0)
    );

    v_now := clock_timestamp();

    -- 重送同一筆時，直接回傳原本的結果。
SELECT c.id INTO v_existing
FROM public.tech_comments AS c
WHERE c.ip_hash = p_ip_hash
  AND c.article_slug = p_article_slug
  AND c.nickname = btrim(p_nickname)
  AND c.content = btrim(p_content)
  AND c.created_at > v_now - interval '10 minutes'
ORDER BY c.created_at DESC
    LIMIT 1;

IF FOUND THEN
        RETURN QUERY SELECT v_existing, true;
RETURN;
END IF;

    IF EXISTS (
        SELECT 1
        FROM public.tech_comments AS c
        WHERE c.ip_hash = p_ip_hash
          AND c.created_at > v_now - interval '60 seconds'
    ) THEN
        RAISE EXCEPTION 'comment_cooldown';
END IF;

    IF (
SELECT count(*)
FROM public.tech_comments AS c
WHERE c.ip_hash = p_ip_hash
  AND c.created_at > v_now - interval '24 hours'
    ) >= 10 THEN
    RAISE EXCEPTION 'comment_daily_limit';
END IF;

INSERT INTO public.tech_comments (
    article_slug,
    nickname,
    content,
    ip_hash,
    created_at
)
VALUES (
           p_article_slug,
           btrim(p_nickname),
           btrim(p_content),
           p_ip_hash,
           v_now
       )
    RETURNING id INTO v_id;

RETURN QUERY SELECT v_id, false;
END;
$$;

REVOKE ALL
    ON FUNCTION public.create_tech_comment(text, text, text, text)
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.create_tech_comment(text, text, text, text)
    TO service_role;

COMMIT;