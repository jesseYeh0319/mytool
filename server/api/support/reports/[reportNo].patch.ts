export default defineEventHandler(async (event) => {
    const { db, user } = await supportSession(event, true)
    const reportNo = supportReportNo(event)
    const input = await readBody(event)
    if (!input || !['open', 'in_progress', 'resolved', 'closed'].includes(input.status)
        || !Number.isSafeInteger(input.version) || input.version < 0
        || typeof input.reply !== 'string' || typeof input.adminNote !== 'string'
        || Array.from(input.reply.trim()).length > 2000 || Array.from(input.adminNote).length > 4000
        || (['resolved', 'closed'].includes(input.status) && !input.reply.trim())) {
        throw createError({ statusCode: 400, data: { message: '請確認狀態與內容；結案或已解決必須填寫公開處理結果。' } })
    }
    const { error } = await db.rpc('update_support_report', {
        p_report_no: reportNo, p_actor: user.id, p_version: input.version,
        p_status: input.status, p_reply: input.reply.trim(), p_admin_note: input.adminNote,
    })
    if (error) {
        if (error.message.includes('support_conflict')) throw createError({ statusCode: 409, data: { message: '案件已由其他人更新，請重新載入後再處理。' } })
        if (error.message.includes('support_not_found')) throw createError({ statusCode: 404 })
        throw createError({ statusCode: 500 })
    }
    return { ok: true }
})
