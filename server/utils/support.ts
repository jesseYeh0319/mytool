import { createClient } from '@supabase/supabase-js'
import type { H3Event } from 'h3'

export async function supportSession(event: H3Event, requireAdmin = false) {
    setResponseHeader(event, 'Cache-Control', 'no-store')
    const token = getHeader(event, 'authorization')
    if (!token?.startsWith('Bearer ')) throw createError({ statusCode: 401 })
    const config = useRuntimeConfig(event)
    const db = createClient(config.public.supabaseUrl, config.supabaseSecretKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: { user }, error } = await db.auth.getUser(token.slice(7))
    if (error || !user) throw createError({ statusCode: 401 })
    // app_metadata 僅能由可信任的管理端設定，不能使用 user_metadata。
    const isAdmin = user.app_metadata?.support_admin === true
    if (requireAdmin && !isAdmin) throw createError({ statusCode: 403 })
    return { db, user, isAdmin }
}

export const supportPublicFields = 'report_no,category,description,book_slug,chapter_slug,order_no,status,created_at,resolved_at,updated_at,version'

export function supportReportNo(event: H3Event) {
    const value = getRouterParam(event, 'reportNo') ?? ''
    if (!/^RP[0-9]{8}-[0-9A-F]{6}$/.test(value)) throw createError({ statusCode: 400 })
    return value
}
