import { createClient } from '@supabase/supabase-js'

import {
  createNewebpayTrade,
} from '../../utils/newebpay'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const authorization = getHeader(event, 'authorization')

  if (!authorization?.startsWith('Bearer ')) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
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

  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(
    authorization.slice(7),
  )

  if (userError || !user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid session',
    })
  }

  // Browser 只提供訂單編號，金額與會員資料由 Server 確認。
  const body = await readBody<{
    orderNo?: unknown
  }>(event)

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

  const {
    data: order,
    error: orderError,
  } = await supabaseAdmin
    .from('orders')
    .select(`
      order_no,
      book_slug,
      chapter_slug,
      amount,
      currency,
      status,
      payment_provider,
      created_at
    `)
    .eq('order_no', orderNo)
    .eq('user_id', user.id)
    .maybeSingle()

  if (orderError) {
    console.error('查詢付款訂單失敗:', orderError)

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
    order.status !== 'pending' ||
    order.payment_provider !== 'newebpay' ||
    order.currency !== 'TWD' ||
    !Number.isInteger(order.amount) ||
    order.amount <= 0
  ) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Order is not payable',
    })
  }

  // 與目前建立訂單 API 的 30 分鐘期限一致。
  const createdAt = Date.parse(order.created_at)

  if (
    !Number.isFinite(createdAt) ||
    Date.now() - createdAt >= 30 * 60 * 1000
  ) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Order expired',
    })
  }

  const {
    data: access,
    error: accessError,
  } = await supabaseAdmin
    .from('chapter_access')
    .select('id')
    .eq('user_id', user.id)
    .eq('book_slug', order.book_slug)
    .eq('chapter_slug', order.chapter_slug)
    .limit(1)
    .maybeSingle()

  if (accessError) {
    console.error('檢查閱讀權限失敗:', accessError)

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to check chapter access',
    })
  }

  if (access) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Chapter already unlocked',
    })
  }

  setResponseHeader(event, 'Cache-Control', 'no-store')

// 這一階段只允許藍新測試環境。
  const testGateway =
      'https://ccore.newebpay.com/MPG/mpg_gateway'

  if (
      config.newebpayApiUrl !== testGateway ||
      !config.newebpayMerchantId ||
      Buffer.byteLength(config.newebpayHashKey, 'utf8') !== 32 ||
      Buffer.byteLength(config.newebpayHashIv, 'utf8') !== 16
  ) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Payment configuration unavailable',
    })
  }

  let notifyUrl: URL

  try {
    notifyUrl = new URL(config.newebpayNotifyUrl)

    if (
        notifyUrl.protocol !== 'https:' ||
        notifyUrl.username ||
        notifyUrl.password ||
        (notifyUrl.port && notifyUrl.port !== '443')
    ) {
      throw new Error('Invalid notification URL')
    }
  } catch {
    throw createError({
      statusCode: 503,
      statusMessage: 'Invalid payment notification URL',
    })
  }

  // 先由既有 verify API 向藍新查詢。
  // 必須轉送登入憑證，不能相信瀏覽器提供的付款狀態。
  let verification: {
    status: string
    message: string
  }

  try {
    verification = await $fetch<{
      status: string
      message: string
    }>('/api/payments/verify', {
      method: 'POST',
      headers: {
        Authorization: authorization,
      },
      body: { orderNo },
      timeout: 20000,
      retry: 0,
    })
  } catch (error: unknown) {
    const fetchError = error as {
      statusCode?: number
      response?: { status?: number }
    } | null

    const statusCode =
        fetchError?.statusCode ??
        fetchError?.response?.status

    if (statusCode === 429) {
      setResponseHeader(event, 'Retry-After', '5')

      throw createError({
        statusCode: 429,
        statusMessage: 'Payment query rate limited',
        data: {
          message: '剛剛已查詢過付款狀態，請等候 5 秒再試。',
        },
      })
    }

    // 查詢失敗不能當成「沒有付款」。
    throw createError({
      statusCode: 503,
      statusMessage: 'Unable to verify payment',
      data: {
        message:
            '目前無法確認付款狀態，暫時無法開啟付款頁。若已付款，請勿重複付款。',
      },
    })
  }

  // 只有藍新明確回覆查無交易，才允許使用原單號。
  if (verification?.status !== 'not_found') {
    let message =
        '此筆交易需要進一步確認，請聯絡客服並提供訂單編號。'

    if (verification?.status === 'paid') {
      // verify 已完成付款同步與權限開通。
      message = '已確認付款成功，請查看已解鎖章節，無須再次付款。'
    } else if (verification?.status === 'not_paid') {
      message =
          `${verification.message} 此單號已有交易紀錄，` +
          '暫不重新送出付款。請使用原付款頁，或聯絡客服協助。'
    }

    throw createError({
      statusCode: 409,
      statusMessage: 'Existing payment transaction',
      data: { message },
    })
  }

  // 查詢期間可能收到付款通知，再確認一次本機訂單。
  const {
    data: latestOrder,
    error: latestOrderError,
  } = await supabaseAdmin
      .from('orders')
      .select('status, amount, currency, payment_provider, created_at')
      .eq('order_no', orderNo)
      .eq('user_id', user.id)
      .maybeSingle()

  if (latestOrderError) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Failed to recheck order',
      data: {
        message: '目前無法確認最新訂單狀態，請稍後再試。',
      },
    })
  }

  const latestCreatedAt = Date.parse(latestOrder?.created_at ?? '')

  if (
      !latestOrder ||
      latestOrder.status !== 'pending' ||
      latestOrder.amount !== order.amount ||
      latestOrder.currency !== order.currency ||
      latestOrder.payment_provider !== 'newebpay' ||
      !Number.isFinite(latestCreatedAt) ||
      Date.now() - latestCreatedAt >= 30 * 60 * 1000
  ) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Order changed or expired',
      data: {
        message: '訂單狀態已變更或超過付款期限，請重新整理後確認。',
      },
    })
  }

  const trade = createNewebpayTrade(
      {
        MerchantID: config.newebpayMerchantId,
        RespondType: 'JSON',
        TimeStamp: Math.floor(Date.now() / 1000),
        Version: '2.0',

        MerchantOrderNo: order.order_no,
        Amt: order.amount,
        ItemDesc: 'MYBB 小說章節閱讀權限',

        //加入付款返回網址
        NotifyURL: notifyUrl.toString(),

        ReturnURL: new URL(
            `/api/payments/return?order=${encodeURIComponent(order.order_no)}`,
            notifyUrl.origin,
        ).toString(),

        ClientBackURL: new URL(
            '/account',
            notifyUrl.origin,
        ).toString(),

        // 目前通知 API 只支援一般信用卡付款。
        CREDIT: 1,
        InstFlag: '0',
        CreditRed: 0,
        UNIONPAY: 0,
        WEBATM: 0,
        VACC: 0,
        CVS: 0,
        BARCODE: 0,

        LoginType: 0,
      },
      config.newebpayHashKey,
      config.newebpayHashIv,
  )

  return {
    success: true,

    order: {
      order_no: order.order_no,
      amount: order.amount,
      currency: order.currency,
    },

    payment: {
      action: testGateway,

      fields: {
        MerchantID: config.newebpayMerchantId,
        TradeInfo: trade.TradeInfo,
        TradeSha: trade.TradeSha,
        Version: '2.0',
        EncryptType: 0,
      },
    },
  }
})