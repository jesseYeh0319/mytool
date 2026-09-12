import {
    commentDatabase,
    commentError,
    requireCommentArticle,
} from '../../../utils/techComments'

export default defineEventHandler(async (event) => {
    setResponseHeader(event, 'Cache-Control', 'no-store')

    const slug = await requireCommentArticle(event)
    const query = getQuery(event)
    const page = Number(query.page ?? 1)

    if (
        !Number.isSafeInteger(page)
        || page < 1
        || page > 10000
    ) {
        commentError(400, '頁碼不正確。')
    }

    const pageSize = 20
    const start = (page - 1) * pageSize
    const db = commentDatabase(event)

    // 多取一筆，只用來判斷是否還有下一頁。
    const { data, error } = await db
        .from('tech_comments')
        .select('id,nickname,content,created_at,ip_label')
        .eq('article_slug', slug)
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(start, start + pageSize)

    if (error) {
        console.error('[tech-comments] 讀取失敗', {
            code: error.code,
        })

        commentError(500, '目前無法讀取留言，請稍後再試。')
    }

    const rows = data ?? []

    return {
        comments: rows.slice(0, pageSize),
        hasMore: rows.length > pageSize,
    }
})