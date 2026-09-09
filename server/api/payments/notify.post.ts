import { createClient } from '@supabase/supabase-js'
import {
    verifyAndDecryptNewebpayTrade,
} from '../../utils/newebpay'

function isRecord(
    value: unknown,
): value is Record<string, unknown> {
    return (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value)
    )
}

export default defineEventHandler(async (event) => {
    setResponseHeader(event, 'Cache-Control', 'no-store')

    const config = useRuntimeConfig(event)

    if (
        !config.newebpayMerchantId ||
        Buffer.byteLength(config.newebpayHashKey, 'utf8') !== 32 ||
        Buffer.byteLength(config.newebpayHashIv, 'utf8') !== 16
    ) {
        console.error('藍新通知 API：金流設定不完整')

        throw createError({
            statusCode: 503,
            statusMessage: 'Payment configuration unavailable',
        })
    }

    // 藍新以表單 POST 傳送通知，不依賴會員登入狀態。
    const body: unknown = await readBody(event)

    if (
        !isRecord(body) ||
        typeof body.TradeInfo !== 'string' ||
        typeof body.TradeSha !== 'string'
    ) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Invalid notification',
        })
    }

    let payload: unknown

    try {
        payload = verifyAndDecryptNewebpayTrade(
            body.TradeInfo,
            body.TradeSha,
            config.newebpayHashKey,
            config.newebpayHashIv,
        )
    } catch (error: unknown) {
        let reason = 'DECRYPT_FAILED'

        if (error instanceof SyntaxError) {
            reason = 'JSON_PARSE_FAILED'
        } else if (error instanceof Error) {
            if (error.message === 'Invalid payment payload') {
                reason = 'INVALID_FORMAT'
            } else if (
                error.message === 'Invalid payment signature'
            ) {
                reason = 'SIGNATURE_MISMATCH'
            }
        }

        // 僅記錄分類，不輸出金鑰、密文或解密內容。
        console.warn('藍新通知驗證失敗:', {
            reason,
            merchantMatches:
                body.MerchantID === config.newebpayMerchantId,
        })

        throw createError({
            statusCode: 400,
            statusMessage: 'Invalid notification',
        })
    }

    if (!isRecord(payload)) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Invalid notification payload',
        })
    }

    // 使用簽章保護的內層 Status，不信任外層 Status。
    // 失敗通知不解鎖，也不覆蓋先前已付款的訂單。
    if (payload.Status !== 'SUCCESS') {
        return 'OK'
    }

    const result = payload.Result

    if (
        !isRecord(result) ||
        result.MerchantID !== config.newebpayMerchantId
    ) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Merchant mismatch',
        })
    }

    // 目前僅支援信用卡付款完成通知。
    if (result.PaymentType !== 'CREDIT') {
        console.warn('藍新通知 API：收到尚未支援的付款方式')

        throw createError({
            statusCode: 400,
            statusMessage: 'Unsupported payment type',
        })
    }

    const orderNo = result.MerchantOrderNo
    const tradeNo = result.TradeNo
    const rawAmount = result.Amt

    const amount =
        typeof rawAmount === 'number'
            ? rawAmount
            : typeof rawAmount === 'string' &&
            /^[0-9]+$/.test(rawAmount)
                ? Number(rawAmount)
                : Number.NaN

    if (
        typeof orderNo !== 'string' ||
        !/^[A-Za-z0-9]{1,30}$/.test(orderNo) ||
        typeof tradeNo !== 'string' ||
        !/^[0-9]+$/.test(tradeNo) ||
        !Number.isSafeInteger(amount) ||
        amount <= 0 ||
        typeof result.PayTime !== 'string' ||
        result.PayTime.trim() === ''
    ) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Invalid payment result',
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
        },
    )

    // SQL 函式會核對訂單金額，並一起完成付款與解鎖。
    const { error } = await supabaseAdmin.rpc(
        'confirm_newebpay_payment',
        {
            p_order_no: orderNo,
            p_trade_no: tradeNo,
            p_amount: amount,
        },
    )

    if (error) {
        console.error('確認藍新付款失敗:', {
            orderNo,
            code: error.code,
            message: error.message,
        })

        // 資料庫處理失敗時不能回報成功。
        throw createError({
            statusCode: 500,
            statusMessage: 'Failed to confirm payment',
        })
    }

    return 'OK'
})