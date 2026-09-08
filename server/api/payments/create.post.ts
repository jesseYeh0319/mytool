import { createClient } from '@supabase/supabase-js'

export default defineEventHandler(async (event) => {
    const config = useRuntimeConfig()

    const authorization = getHeader(
        event,
        'authorization'
    )

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
     * 售價只能由伺服器從 Content 取得，
     * 不能相信 Browser 傳入的金額。
     */
    const chapter = await queryCollection(
        event,
        'novelChapters'
    )
        .where(
            'stem',
            '=',
            `novels/${bookSlug}/${chapterSlug}`
        )
        .first()

    const chapterPrice = Number(chapter?.price)

    if (
        !chapter ||
        chapter.isFree !== false ||
        !Number.isInteger(chapterPrice) ||
        chapterPrice <= 0
    ) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Chapter is not purchasable',
        })
    }

    const supabaseAdmin = createClient(
        config.public.supabaseUrl,
        config.supabaseSecretKey,
        {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
            },
        }
    )

    /*
     * 使用 Access Token 取得真正會員，
     * 不接受 Browser 自己傳入 userId。
     */
    const {
        data: { user },
        error: userError,
    } = await supabaseAdmin.auth.getUser(
        accessToken
    )

    if (userError || !user) {
        throw createError({
            statusCode: 401,
            statusMessage: 'Invalid session',
        })
    }

    /*
     * 已解鎖時不建立重複訂單。
     */
    const {
        data: existingAccess,
        error: accessError,
    } = await supabaseAdmin
        .from('chapter_access')
        .select('id')
        .eq('user_id', user.id)
        .eq('book_slug', bookSlug)
        .eq('chapter_slug', chapterSlug)
        .maybeSingle()

    if (accessError) {
        console.error(
            '檢查章節權限失敗:',
            accessError
        )

        throw createError({
            statusCode: 500,
            statusMessage: 'Failed to check chapter access',
        })
    }

    if (existingAccess) {
        throw createError({
            statusCode: 409,
            statusMessage: 'Chapter already unlocked',
        })
    }

    /*
 * 30 分鐘內已有相同待付款訂單時，
 * 直接沿用，不重複新增。
 */
    const pendingOrderCutoff = new Date(
        Date.now() - 30 * 60 * 1000
    ).toISOString()

    const {
        data: existingPendingOrder,
        error: pendingOrderError,
    } = await supabaseAdmin
        .from('orders')
        .select(`
    id,
    order_no,
    book_slug,
    chapter_slug,
    amount,
    currency,
    status,
    created_at
  `)
        .eq('user_id', user.id)
        .eq('book_slug', bookSlug)
        .eq('chapter_slug', chapterSlug)
        .eq('amount', chapterPrice)
        .eq('currency', 'TWD')
        .eq('status', 'pending')
        .eq('payment_provider', 'newebpay')
        .gte('created_at', pendingOrderCutoff)
        .order('created_at', {
            ascending: false,
        })
        .limit(1)
        .maybeSingle()

    if (pendingOrderError) {
        console.error(
            '檢查待付款訂單失敗:',
            pendingOrderError
        )

        throw createError({
            statusCode: 500,
            statusMessage:
                'Failed to check pending order',
        })
    }

    if (existingPendingOrder) {
        return {
            success: true,
            reused: true,
            order: existingPendingOrder,
        }
    }

    /*
     * 藍新的 MerchantOrderNo 只能使用英數字，
     * 因此不使用連字號。
     */
    const orderNo = [
        'MYBB',
        Date.now(),
        Math.random()
            .toString(36)
            .slice(2, 8)
            .toUpperCase(),
    ].join('')

    const {
        data: order,
        error: orderError,
    } = await supabaseAdmin
        .from('orders')
        .insert({
            user_id: user.id,
            order_no: orderNo,
            book_slug: bookSlug,
            chapter_slug: chapterSlug,
            amount: chapterPrice,
            currency: 'TWD',
            status: 'pending',
            payment_provider: 'newebpay',
            provider_payment_id: null,
            paid_at: null,
        })
        .select(`
      id,
      order_no,
      book_slug,
      chapter_slug,
      amount,
      currency,
      status,
      created_at
    `)
        .single()

    if (orderError || !order) {
        console.error(
            '建立待付款訂單失敗:',
            orderError
        )

        throw createError({
            statusCode: 500,
            statusMessage: 'Failed to create order',
        })
    }

    return {
        success: true,
        reused: false,
        order,
    }
})