import { createClient } from '@supabase/supabase-js'

const CATEGORIES = [
    'content',
    'reading',
    'paid_unreadable',
    'other',
] as const

type Category = typeof CATEGORIES[number]

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const ORDER_NO_PATTERN = /^[A-Za-z0-9]{1,30}$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/*
 * 描述裡出現看起來像信用卡號的數字就拒收。
 *
 * 前後不能緊貼英數字，
 * 避免把訂單編號（MYBB + 13 位數字）誤判成卡號。
 */
function containsCardNumber(text: string) {
    const candidates = text.match(
        /(?<![A-Za-z0-9])(?:\d[ -]?){12,18}\d(?![A-Za-z0-9])/g,
    ) ?? []

    return candidates.some((candidate) => {
        const digits = candidate.replace(/\D/g, '')

        if (digits.length < 13 || digits.length > 19) {
            return false
        }

        // Luhn 檢查碼：真正的卡號才會通過。
        let sum = 0
        let double = false

        for (let i = digits.length - 1; i >= 0; i -= 1) {
            let digit = Number(digits[i])

            if (double) {
                digit *= 2

                if (digit > 9) {
                    digit -= 9
                }
            }

            sum += digit
            double = !double
        }

        return sum % 10 === 0
    })
}

function badRequest(message: string): never {
    throw createError({
        statusCode: 400,
        statusMessage: 'Invalid support report',
        data: { message },
    })
}

export default defineEventHandler(async (event) => {
    setResponseHeader(event, 'Cache-Control', 'no-store')

    const config = useRuntimeConfig(event)
    const authorization = getHeader(event, 'authorization')

    if (!authorization?.startsWith('Bearer ')) {
        throw createError({
            statusCode: 401,
            statusMessage: 'Unauthorized',
        })
    }

    const admin = createClient(
        config.public.supabaseUrl,
        config.supabaseSecretKey,
        {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
            },
        },
    )

    // 不相信 Browser 傳來的身分，用 access token 向 Supabase 確認。
    const {
        data: { user },
        error: authError,
    } = await admin.auth.getUser(authorization.slice(7))

    if (authError || !user) {
        throw createError({
            statusCode: 401,
            statusMessage: 'Invalid session',
        })
    }

    const input = (await readBody<{
        category?: unknown
        description?: unknown
        contactEmail?: unknown
        bookSlug?: unknown
        chapterSlug?: unknown
        orderNo?: unknown
    }>(event)) ?? {}

    const category = input.category

    if (
        typeof category !== 'string' ||
        !CATEGORIES.includes(category as Category)
    ) {
        badRequest('請選擇問題類型。')
    }

    const description =
        typeof input.description === 'string'
            ? input.description.trim()
            : ''

    // 用字元數計算，跟資料庫的 char_length 一致。
    const descriptionLength = Array.from(description).length

    if (descriptionLength < 10 || descriptionLength > 2000) {
        badRequest('問題描述需要 10 到 2000 個字。')
    }

    if (containsCardNumber(description)) {
        badRequest(
            '描述裡似乎有信用卡號碼，為了你的安全，請刪除後再送出。',
        )
    }

    const contactEmail =
        typeof input.contactEmail === 'string'
            ? input.contactEmail.trim()
            : ''

    if (
        contactEmail.length > 254 ||
        !EMAIL_PATTERN.test(contactEmail)
    ) {
        badRequest('請填寫正確的聯絡信箱。')
    }

    let bookSlug: string | null = null
    let chapterSlug: string | null = null
    let orderNo: string | null = null

    const rawOrderNo = input.orderNo
    const rawBookSlug = input.bookSlug
    const rawChapterSlug = input.chapterSlug

    if (rawOrderNo !== undefined && rawOrderNo !== null && rawOrderNo !== '') {
        // 從訂單進入：必須是自己的訂單，章節資訊以訂單為準。
        if (
            typeof rawOrderNo !== 'string' ||
            !ORDER_NO_PATTERN.test(rawOrderNo)
        ) {
            badRequest('訂單編號格式不正確。')
        }

        const {
            data: order,
            error: orderError,
        } = await admin
            .from('orders')
            .select('order_no, book_slug, chapter_slug')
            .eq('order_no', rawOrderNo)
            .eq('user_id', user.id)
            .maybeSingle()

        if (orderError) {
            throw createError({
                statusCode: 500,
                statusMessage: 'Failed to load order',
            })
        }

        if (!order) {
            badRequest('找不到這筆訂單，請從會員中心的訂單進入。')
        }

        orderNo = order.order_no
        bookSlug = order.book_slug
        chapterSlug = order.chapter_slug
    } else if (rawBookSlug || rawChapterSlug) {
        // 從章節進入：確認章節真的存在。
        if (
            typeof rawBookSlug !== 'string' ||
            typeof rawChapterSlug !== 'string' ||
            !SLUG_PATTERN.test(rawBookSlug) ||
            !SLUG_PATTERN.test(rawChapterSlug)
        ) {
            badRequest('章節資訊格式不正確。')
        }

        const chapter = await queryCollection(event, 'novelChapters')
            .where(
                'stem',
                '=',
                `novels/${rawBookSlug}/${rawChapterSlug}`,
            )
            .first()

        if (!chapter) {
            badRequest('找不到這個章節。')
        }

        bookSlug = rawBookSlug
        chapterSlug = rawChapterSlug
    }

    // 瀏覽器版本，協助排查閱讀進度與書籤問題。
    const userAgent = (getHeader(event, 'user-agent') ?? '').slice(0, 300)

    const { data, error } = await admin
        .rpc('create_support_report', {
            p_user_id: user.id,
            p_category: category,
            p_description: description,
            p_contact_email: contactEmail,
            p_book_slug: bookSlug,
            p_chapter_slug: chapterSlug,
            p_order_no: orderNo,
            p_user_agent: userAgent,
        })
        .single()

    if (error) {
        if (error.message.includes('support_report_cooldown')) {
            throw createError({
                statusCode: 429,
                statusMessage: 'Support report cooldown',
                data: {
                    message: '剛剛已送出回報，請等 1 分鐘後再送出新的問題。',
                },
            })
        }

        if (error.message.includes('support_report_daily_limit')) {
            throw createError({
                statusCode: 429,
                statusMessage: 'Support report daily limit',
                data: {
                    message: '今天送出的回報已達上限，請改寄信到客服信箱。',
                },
            })
        }

        // 不記錄描述與信箱，避免個資進到伺服器日誌。
        console.error('建立問題回報失敗:', {
            code: error.code,
            message: error.message,
        })

        throw createError({
            statusCode: 500,
            statusMessage: 'Failed to create support report',
            data: {
                message: '目前無法送出回報，請稍後再試。',
            },
        })
    }

    const result = data as {
        report_number: string
        is_duplicate: boolean
    }

    return {
        reportNo: result.report_number,
        duplicate: result.is_duplicate,
    }
})