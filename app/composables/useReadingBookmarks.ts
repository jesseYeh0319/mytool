export type ReadingBookmark = {
    id: string
    book_slug: string
    chapter_slug: string
    progress: number
    note: string
    created_at: string
}

export const useReadingBookmarks = () => {
    const supabase = useSupabase()

    /*
     * 取得自己的所有書籤。
     *
     * RLS 已限定只回傳本人的資料，
     * 排序對應 reading_bookmarks_user_created_idx。
     */
    const listBookmarks = async () => {
        const {
            data,
            error,
        } = await supabase
            .from('reading_bookmarks')
            .select(`
                id,
                book_slug,
                chapter_slug,
                progress,
                note,
                created_at
            `)
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })

        if (error) {
            console.error('取得閱讀書籤失敗:', error)

            return {
                bookmarks: null,
                error,
            }
        }

        return {
            bookmarks: (data ?? []) as ReadingBookmark[],
            error: null,
        }
    }

    /*
     * 刪除單一書籤。
     *
     * 真正的防線是 RLS 的 delete policy，
     * 這裡再帶一次 user_id 只是多一層保險。
     */
    const deleteBookmark = async (
        id: string,
        userId: string,
    ) => {
        const { error } = await supabase
            .from('reading_bookmarks')
            .delete()
            .eq('id', id)
            .eq('user_id', userId)

        if (error) {
            console.error('刪除閱讀書籤失敗:', error)
            return false
        }

        return true
    }

    return {
        listBookmarks,
        deleteBookmark,
    }
}