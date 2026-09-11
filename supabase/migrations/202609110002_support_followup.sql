BEGIN;

ALTER TABLE public.support_reports
    ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN version integer NOT NULL DEFAULT 0;

CREATE TABLE public.support_report_events (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    report_no text NOT NULL REFERENCES public.support_reports(report_no) ON DELETE CASCADE,
    actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    status text NOT NULL CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
    reply text NOT NULL CHECK (char_length(reply) <= 2000),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_report_events_report_idx ON public.support_report_events(report_no, id);
ALTER TABLE public.support_report_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.support_report_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.support_report_events_id_seq FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.support_report_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.support_report_events_id_seq TO service_role;

-- 伺服器驗證管理者後呼叫。鎖定案件並檢查版本，狀態與歷程一同寫入。
CREATE FUNCTION public.update_support_report(
    p_report_no text, p_actor uuid, p_version integer,
    p_status text, p_reply text, p_admin_note text
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
    v_report public.support_reports%ROWTYPE;
BEGIN
    IF p_status IS NULL OR p_status NOT IN ('open', 'in_progress', 'resolved', 'closed')
       OR p_reply IS NULL OR char_length(p_reply) > 2000
       OR p_admin_note IS NULL OR char_length(p_admin_note) > 4000
       OR p_actor IS NULL OR p_version IS NULL
       OR (p_status IN ('resolved', 'closed') AND btrim(p_reply) = '') THEN
        RAISE EXCEPTION 'support_invalid_update';
    END IF;
    SELECT * INTO v_report FROM public.support_reports WHERE report_no = p_report_no FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'support_not_found'; END IF;
    IF v_report.version <> p_version THEN RAISE EXCEPTION 'support_conflict'; END IF;
    UPDATE public.support_reports SET
        status = p_status, admin_note = p_admin_note, version = version + 1,
        updated_at = clock_timestamp(),
        resolved_at = CASE WHEN p_status IN ('resolved', 'closed')
            THEN coalesce(resolved_at, clock_timestamp()) ELSE NULL END
    WHERE report_no = p_report_no;
    IF v_report.status <> p_status OR btrim(p_reply) <> '' THEN
        INSERT INTO public.support_report_events(report_no, actor_id, status, reply)
        VALUES (p_report_no, p_actor, p_status, btrim(p_reply));
    END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.update_support_report(text, uuid, integer, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_support_report(text, uuid, integer, text, text, text) TO service_role;
COMMIT;
