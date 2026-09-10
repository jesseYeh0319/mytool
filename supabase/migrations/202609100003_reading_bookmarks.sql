BEGIN;

CREATE TABLE public.reading_bookmarks (
                                          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

                                          user_id uuid NOT NULL
                                              REFERENCES auth.users(id) ON DELETE CASCADE,

                                          book_slug text NOT NULL
                                              CHECK (book_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),

  chapter_slug text NOT NULL
    CHECK (chapter_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),

  progress smallint NOT NULL
    CHECK (progress BETWEEN 0 AND 100),

  note text NOT NULL DEFAULT ''
    CHECK (char_length(note) <= 200),

  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_id, book_slug, chapter_slug, progress)
);

CREATE INDEX reading_bookmarks_user_created_idx
    ON public.reading_bookmarks (
                                 user_id,
                                 created_at DESC,
                                 id
        );

ALTER TABLE public.reading_bookmarks
    ENABLE ROW LEVEL SECURITY;

-- 會員只能查看自己的書籤。
CREATE POLICY "Users can read own bookmarks"
  ON public.reading_bookmarks
  FOR SELECT
                 TO authenticated
                 USING ((SELECT auth.uid()) = user_id);

-- 會員只能替自己新增書籤。
CREATE POLICY "Users can insert own bookmarks"
  ON public.reading_bookmarks
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- 會員只能刪除自己的書籤。
CREATE POLICY "Users can delete own bookmarks"
  ON public.reading_bookmarks
  FOR DELETE
TO authenticated
  USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.reading_bookmarks
    FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, DELETE
    ON TABLE public.reading_bookmarks
    TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE public.reading_bookmarks
    TO service_role;

COMMIT;