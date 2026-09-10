import { createClient } from '@supabase/supabase-js'
import { createHash, timingSafeEqual } from 'node:crypto'

function isRecord(
    value: unknown,
): value is Record<string, unknown> {
    return typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value)
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

    const body = await readBody<{ orderNo?: unknown }>(event)
    const orderNo = body?.orderNo

    if (
        typeof orderNo !== 'string' ||
        !/^[A-Za-z0-9]{1,30}$/.test(orderNo)
    ) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Invalid order number',
        })
    }

    // 金額從資料庫取得，並限制只能查自己的訂單。
    const { data: order, error: orderError } = await admin
        .from('orders')
        .select('order_no, amount, currency, status, payment_provider')
        .eq('order_no', orderNo)
        .eq('user_id', user.id)
        .maybeSingle()

    if (orderError) {
        throw createError({
            statusCode: 500,
            statusMessage: 'Failed to load order',
        })
    }

    if (!order) {
        throw createError({
            statusCode: 404,
            statusMessage: 'Order not found',
        })
    }

    if (
        order.payment_provider !== 'newebpay' ||
        order.currency !== 'TWD' ||
        !Number.isInteger(order.amount) ||
        order.amount <= 0
    ) {
        throw createError({
            statusCode: 409,
            statusMessage: 'Unsupported order',
        })
    }

    // 目前專案仍限定使用藍新測試環境。
    if (
        config.newebpayApiUrl !==
        'https://ccore.newebpay.com/MPG/mpg_gateway' ||
        !/^[A-Za-z0-9]+$/.test(config.newebpayMerchantId) ||
        Buffer.byteLength(config.newebpayHashKey, 'utf8') !== 32 ||
        Buffer.byteLength(config.newebpayHashIv, 'utf8') !== 16
    ) {
        throw createError({
            statusCode: 503,
            statusMessage: 'Payment configuration unavailable',
        })
    }

    // 前面已驗證登入、訂單擁有者與金流設定。
// 每位會員跨訂單共用 30 秒查詢冷卻時間。
    const {
        data: queryAllowed,
        error: queryLimitError,
    } = await admin.rpc('claim_payment_query', {
        p_user_id: user.id,
    })

    if (queryLimitError) {
        console.error('檢查付款查詢限制失敗:', {
            code: queryLimitError.code,
        })

        throw createError({
            statusCode: 503,
            statusMessage: 'Payment query temporarily unavailable',
        })
    }

    if (queryAllowed !== true) {
        setResponseHeader(event, 'Retry-After', '5')

        throw createError({
            statusCode: 429,
            statusMessage: 'Payment query rate limited',
        })
    }

    const merchantId = config.newebpayMerchantId

    // 官方 CheckValue：欄位按名稱排序，IV 在前、Key 在後。
    const queryString = new URLSearchParams({
        Amt: String(order.amount),
        MerchantID: merchantId,
        MerchantOrderNo: orderNo,
    }).toString()

    const checkValue = createHash('sha256')
        .update(
            `IV=${config.newebpayHashIv}&${queryString}` +
            `&Key=${config.newebpayHashKey}`,
            'utf8',
        )
        .digest('hex')
        .toUpperCase()

    let response: unknown

    try {
        response = await $fetch<unknown>(
            'https://ccore.newebpay.com/API/QueryTradeInfo',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    MerchantID: merchantId,
                    Version: '1.3',
                    RespondType: 'JSON',
                    CheckValue: checkValue,
                    TimeStamp: String(Math.floor(Date.now() / 1000)),
                    MerchantOrderNo: orderNo,
                    Amt: String(order.amount),
                }).toString(),
                responseType: 'json',
                timeout: 10000,
                retry: 0,
                redirect: 'error',
            },
        )
    } catch {
        throw createError({
            statusCode: 502,
            statusMessage: 'Payment provider unavailable',
        })
    }

    if (!isRecord(response)) {
        throw createError({
            statusCode: 502,
            statusMessage: 'Invalid provider response',
        })
    }

    if (response.Status === 'TRA10021') {
        return {
            status: 'not_found',
            message:
                '藍新查無此筆交易。訂單可能尚未送出付款；若已付款，請聯絡客服核對。',
        }
    }

    if (response.Status !== 'SUCCESS') {
        // 只記錄錯誤代碼，不輸出完整金流回應。
        console.warn('藍新交易查詢失敗:', {
            code: typeof response.Status === 'string'
                ? response.Status
                : 'UNKNOWN',
        })

        throw createError({
            statusCode: 502,
            statusMessage: 'Payment query failed',
        })
    }

    const result = response.Result

    if (
        !isRecord(result) ||
        result.MerchantID !== merchantId ||
        result.MerchantOrderNo !== orderNo ||
        !(
            result.Amt === order.amount ||
            result.Amt === String(order.amount)
        ) ||
        typeof result.TradeNo !== 'string' ||
        !/^[0-9]{1,20}$/.test(result.TradeNo) ||
        typeof result.CheckCode !== 'string' ||
        !/^[0-9a-f]{64}$/i.test(result.CheckCode)
    ) {
        throw createError({
            statusCode: 502,
            statusMessage: 'Payment result mismatch',
        })
    }

    // 回應使用 CheckCode，公式不同於送出時的 CheckValue。
    const checkString = new URLSearchParams({
        Amt: String(result.Amt),
        MerchantID: merchantId,
        MerchantOrderNo: orderNo,
        TradeNo: result.TradeNo,
    }).toString()

    const expected = createHash('sha256')
        .update(
            `HashIV=${config.newebpayHashIv}&${checkString}` +
            `&HashKey=${config.newebpayHashKey}`,
            'utf8',
        )
        .digest()

    if (!timingSafeEqual(
        expected,
        Buffer.from(result.CheckCode, 'hex'),
    )) {
        throw createError({
            statusCode: 502,
            statusMessage: 'Invalid payment check code',
        })
    }

    const tradeStatus = String(result.TradeStatus)

    if (tradeStatus !== '1') {
        const messages: Record<string, string> = {
            '0': '藍新目前顯示此筆交易尚未付款。',
            '2': '藍新顯示此筆交易付款失敗。',
            '3': '藍新顯示此筆交易已取消付款。',
            '6': '藍新顯示此筆交易已退款。',
        }

        return {
            status: 'not_paid',
            message: messages[tradeStatus] ??
                '藍新目前尚未回報付款成功，請稍後再確認。',
        }
    }

    // 退款或其他異常狀態不自動重新開通。
    // BackStatus 為 0 表示未發動退款。
    if (
        result.PaymentType !== 'CREDIT' ||
        String(result.BackStatus) !== '0' ||
        !['pending', 'cancelled', 'paid'].includes(order.status)
    ) {
        return {
            status: 'review_required',
            message:
                '查到付款紀錄，但訂單或退款狀態需要核對，請聯絡客服。',
        }
    }

    const { error: confirmError } = await admin.rpc(
        'confirm_newebpay_payment',
        {
            p_order_no: orderNo,
            p_trade_no: result.TradeNo,
            p_amount: order.amount,
        },
    )

    if (confirmError) {
        console.error('查詢後同步付款失敗:', {
            orderNo,
            code: confirmError.code,
        })

        throw createError({
            statusCode: 500,
            statusMessage: 'Failed to synchronize payment',
        })
    }

    return {
        status: 'paid',
        message: '藍新已確認付款成功。',
    }
})