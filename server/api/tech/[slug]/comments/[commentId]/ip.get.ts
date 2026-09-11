import { supportSession } from '../../../../../utils/support'
import {
    commentError,
    requireCommentArticle,
} from '../../../../../utils/techComments'

export default defineEventHandler(async (event) => {
    setResponseHeader(event, 'Cache-Control', 'no-store')
    setResponseHeader(event, 'Vary', 'Authorization')

    // 每次向 Supabase 驗證登入與管理者資格。
    // 普通會員或未登入訪客不能讀取完整 IP。
    const { db } = await supportSession(event, true)

    const slug = await requireCommentArticle(event)
    const commentId = getRouterParam(event, 'commentId') ?? ''

    if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
            .test(commentId)
    ) {
        commentError(400, '留言編號不正確。')
    }

    const { data: comment, error: commentQueryError } = await db
        .from('tech_comments')
        .select('id,ip_label')
        .eq('id', commentId)
        .eq('article_slug', slug)
        .eq('status', 'published')
        .maybeSingle()

    if (commentQueryError) {
        commentError(500, '目前無法讀取留言資料。')
    }

    if (!comment) {
        commentError(404, '找不到這則留言。')
    }

    const { data: privateIP, error: ipQueryError } = await db
        .from('tech_comment_private_ips')
        .select('ip_address')
        .eq('comment_id', commentId)
        .maybeSingle()

    if (ipQueryError) {
        commentError(500, '目前無法讀取 IP。')
    }

    return {
        ip: privateIP?.ip_address
            ?? (
                comment.ip_label === '本機測試'
                    ? '本機測試（未記錄真實 IP）'
                    : '未記錄'
            ),
    }
})