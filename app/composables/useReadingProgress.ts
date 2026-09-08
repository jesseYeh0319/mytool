type ReadingProgressPayload = {
    userId: string
    bookSlug: string
    chapterSlug: string
    progress: number
}

export const useReadingProgress = () => {
    const supabase = useSupabase()

    const saveReadingProgressToCloud = async (
        payload: ReadingProgressPayload,
    ) => {
        const {
            userId,
            bookSlug,
            chapterSlug,
            progress,
        } = payload

        const { error } = await supabase
            .from('reading_progress')
            .upsert(
                {
                    user_id: userId,
                    book_slug: bookSlug,
                    chapter_slug: chapterSlug,
                    progress,
                    updated_at: new Date().toISOString(),
                },
                {
                    onConflict: 'user_id,book_slug',
                },
            )

        if (error) {
            console.error('儲存雲端閱讀進度失敗:', error)
            return false
        }

        return true
    }

    const getReadingProgressFromCloud = async (
        bookSlug: string,
    ) => {
        const {
            data,
            error,
        } = await supabase
            .from('reading_progress')
            .select(`
        chapter_slug,
        progress,
        updated_at
      `)
            .eq('book_slug', bookSlug)
            .maybeSingle()

        if (error) {
            console.error('取得雲端閱讀進度失敗:', error)
            return null
        }

        return data
    }

    return {
        saveReadingProgressToCloud,
        getReadingProgressFromCloud,
    }
}