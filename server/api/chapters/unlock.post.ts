import { createClient } from '@supabase/supabase-js'

export default defineEventHandler(async (event) => {
    // 模擬購買 API 只能在本機開發環境使用
    if (!import.meta.dev) {
        throw createError({
            statusCode: 403,
            statusMessage: 'Mock unlock is disabled in production',
        })
    }

    const config = useRuntimeConfig()

    const authorization = getHeader(event, 'authorization')

    if (!authorization?.startsWith('Bearer ')) {
        throw createError({
            statusCode: 401,
            statusMessage: 'Unauthorized',
        })
    }

    const accessToken = authorization.slice(7)

    const body = await readBody<{
        bookSlug?: string
        chapterSlug?: string
    }>(event)

    const bookSlug = body.bookSlug
    const chapterSlug = body.chapterSlug

    if (
        !bookSlug ||
        !chapterSlug ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(bookSlug) ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(chapterSlug)
    ) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Invalid chapter',
        })
    }

    /*
     * Server-only Supabase Client。
     *
     * 這把 Secret Key 絕對不能出現在瀏覽器端。
     */
    const supabaseAdmin = createClient(
        config.public.supabaseUrl,
        config.supabaseSecretKey,
        {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
            },
        },
    )

    /*
     * 不能相信 Browser 傳來的 user_id。
     *
     * 我們用 Browser 的 Access Token
     * 向 Supabase 確認真正的登入使用者。
     */
    const {
        data: { user },
        error: userError,
    } = await supabaseAdmin.auth.getUser(accessToken)

    if (userError || !user) {
        throw createError({
            statusCode: 401,
            statusMessage: 'Invalid session',
        })
    }

    /*
     * 模擬「付款成功」。
     *
     * 真正付款功能上線後，
     * 這裡會改成付款成功 Webhook 才能執行。
     */
    const { error: accessError } = await supabaseAdmin
        .from('chapter_access')
        .upsert(
            {
                user_id: user.id,
                book_slug: bookSlug,
                chapter_slug: chapterSlug,
            },
            {
                onConflict: 'user_id,book_slug,chapter_slug',
            },
        )

    if (accessError) {
        console.error('新增章節權限失敗:', accessError)

        throw createError({
            statusCode: 500,
            statusMessage: 'Failed to unlock chapter',
        })
    }

    return {
        success: true,
        bookSlug,
        chapterSlug,
    }
})