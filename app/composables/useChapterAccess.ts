export const useChapterAccess = () => {
    const supabase = useSupabase()

    const hasAccess = async (
        bookSlug: string,
        chapterSlug: string,
    ) => {
        const {
            data,
            error,
        } = await supabase
            .from('chapter_access')
            .select('id')
            .eq('book_slug', bookSlug)
            .eq('chapter_slug', chapterSlug)
            .maybeSingle()

        if (error) {
            console.error('查詢章節權限失敗:', error)
            return false
        }

        return Boolean(data)
    }

    /*
     * 一次取得整本書已購買的章節。
     *
     * RLS 已限定只會回傳自己的紀錄，
     * 所以不需要再帶 user_id 條件。
     */
    const getBookAccess = async (bookSlug: string) => {
        const {
            data,
            error,
        } = await supabase
            .from('chapter_access')
            .select('chapter_slug')
            .eq('book_slug', bookSlug)

        if (error) {
            console.error('查詢已購買章節失敗:', error)

            return new Set<string>()
        }

        return new Set(
            (data ?? []).map(row => row.chapter_slug as string),
        )
    }

    return {
        hasAccess,
        getBookAccess,
    }
}