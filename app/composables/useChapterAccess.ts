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

    return {
        hasAccess,
    }
}