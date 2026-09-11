export default defineEventHandler(async (event) => {
    const { db, user, isAdmin } = await supportSession(event)
    const query = getQuery(event)
    const adminMode = query.scope === 'admin'
    if (adminMode && !isAdmin) throw createError({ statusCode: 403 })
    const page = Number(query.page ?? 1)
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw createError({ statusCode: 400 })
    const status = query.status ?? 'all'
    if (!['all', 'open', 'in_progress', 'resolved', 'closed'].includes(String(status))) throw createError({ statusCode: 400 })
    let request = db.from('support_reports').select(supportPublicFields, { count: 'exact' })
    if (!adminMode) request = request.eq('user_id', user.id)
    if (status !== 'all') request = request.eq('status', status)
    const { data, count, error } = await request.order('created_at', { ascending: false })
        .order('report_no').range((page - 1) * 20, page * 20 - 1)
    if (error) throw createError({ statusCode: 500 })
    return { reports: data, total: count ?? 0, isAdmin }
})
