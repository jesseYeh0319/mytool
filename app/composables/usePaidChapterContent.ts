export const usePaidChapterContent = () => {
    const supabase = useSupabase()

    const getPaidChapterContent = async (
        bookSlug: string,
        chapterSlug: string,
    ) => {
        const {
            data,
            error,
        } = await supabase
            .from('paid_chapter_content')
            .select('body')
            .eq('book_slug', bookSlug)
            .eq('chapter_slug', chapterSlug)
            .maybeSingle()

        if (error) {
            console.error('取得付費章節正文失敗:', error)

            return null
        }

        return data?.body ?? null
    }

    return {
        getPaidChapterContent,
    }
}