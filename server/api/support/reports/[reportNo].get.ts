export default defineEventHandler(async (event) => {
    const { db, user, isAdmin } = await supportSession(event)
    const reportNo = supportReportNo(event)
    const adminMode = getQuery(event).scope === 'admin'
    if (adminMode && !isAdmin) throw createError({ statusCode: 403 })
    let request = db.from('support_reports')
        .select(adminMode ? `${supportPublicFields},contact_email,admin_note,user_agent` : supportPublicFields)
        .eq('report_no', reportNo)
    if (!adminMode) request = request.eq('user_id', user.id)
    const { data: report, error } = await request.maybeSingle()
    if (error) throw createError({ statusCode: 500 })
    if (!report) throw createError({ statusCode: 404 })
    const { data: history, error: historyError } = await db.from('support_report_events')
        .select('id,status,reply,created_at').eq('report_no', reportNo).order('id')
    if (historyError) throw createError({ statusCode: 500 })
    return { report, history }
})
