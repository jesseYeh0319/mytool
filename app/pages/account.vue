<script setup lang="ts">

const orderCopyMessage = ref('')
let orderCopyRequestId = 0

async function copyOrderNumber(orderNo: string) {
  const requestId = ++orderCopyRequestId
  orderCopyMessage.value = ''

  try {
    await navigator.clipboard.writeText(orderNo)

    if (requestId !== orderCopyRequestId) return
    orderCopyMessage.value = `已複製訂單編號：${orderNo}`
  } catch {
    if (requestId !== orderCopyRequestId) return
    orderCopyMessage.value = '無法自動複製，請展開訂單明細，手動選取訂單編號複製。'
  }
}

type ChapterAccess = {
  id: number
  book_slug: string
  chapter_slug: string
  created_at: string
}

type AccessView = ChapterAccess & {
  bookTitle: string
  chapterTitle: string
}

type RecentReading = {
  bookSlug: string
  bookTitle: string
  chapterSlug: string
  chapterTitle: string
  progress: number
  updatedAt: string
}

type Order = {
  id: number
  order_no: string
  book_slug: string
  chapter_slug: string
  amount: number
  currency: string
  status: string
  created_at: string
  paid_at: string | null
}

type OrderView = Order & {
  bookTitle: string
  chapterTitle: string
  statusLabel: string
}

const accessViewList = ref<AccessView[]>([])
const recentReadings = ref<RecentReading[]>([])
const orders = ref<OrderView[]>([])

type OrderFilter = 'all' | 'pending' | 'paid' | 'other'

const orderFilter = ref<OrderFilter>('all')

const orderFilterOptions: {
  value: OrderFilter
  label: string
}[] = [
  { value: 'all', label: '全部' },
  { value: 'pending', label: '待付款' },
  { value: 'paid', label: '已付款' },
  { value: 'other', label: '其他狀態' },
]

const ORDER_PAGE_SIZE = 10
const orderPage = ref(1)
const orderTotal = ref(0)
const ordersLoading = ref(false)
const ordersError = ref('')

const orderCounts = ref<Record<OrderFilter, number>>({
  all: 0,
  pending: 0,
  paid: 0,
  other: 0,
})

const orderPageCount = computed(() =>
    Math.max(1, Math.ceil(orderTotal.value / ORDER_PAGE_SIZE)),
)

let ordersRequestId = 0

function selectOrderFilter(filter: OrderFilter) {
  orderFilter.value = filter
  orderPage.value = 1
}

function orderCount(filter: OrderFilter) {
  return orderCounts.value[filter]
}

const {
  user,
  initialized,
} = useAuth()

const {
  listBookmarks,
  deleteBookmark,
} = useReadingBookmarks()

type BookmarkView = ReadingBookmark & {
  bookTitle: string
  chapterTitle: string
}

const bookmarks = ref<BookmarkView[]>([])
const bookmarksLoading = ref(false)
const bookmarksError = ref('')
const deletingBookmarkId = ref('')

let bookmarksRequestId = 0

const supabase = useSupabase()
const route = useRoute()
const paymentMessage = ref('')
const paymentReadPath = ref('')
const paymentChecking = ref(false)
const paymentRetry = ref(0)
const providerChecking = ref(false)
let providerRequestId = 0
let stopPaymentPolling: (() => void) | undefined
const openingPaymentCheck = ref(false)

// 與章節頁一致，付款入口目前只開放本機開發環境。
const paymentAvailable = import.meta.dev

// 正在前往藍新的訂單編號，用來鎖住按鈕避免重複送出。
const resumingOrderNo = ref('')
// 記住是「哪一筆」訂單出錯，才不會每張卡片都顯示同一則訊息。
const resumeError = ref<{
  orderNo: string
  message: string
} | null>(null)

async function retryPaymentCheck() {
  if (
      paymentChecking.value ||
      providerChecking.value ||
      !paymentOrderNo.value ||
      !user.value
  ) {
    return
  }

  const requestId = ++providerRequestId
  const orderNo = paymentOrderNo.value
  const userId = user.value.id

  const isCurrent = () =>
      requestId === providerRequestId &&
      paymentOrderNo.value === orderNo &&
      user.value?.id === userId

  providerChecking.value = true
  paymentMessage.value = '正在向藍新確認付款結果…'

  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession()

    if (!isCurrent()) return

    if (error || !session) {
      paymentMessage.value = '登入已失效，請重新登入後確認。'
      return
    }

    const result = await $fetch<{
      status: string
      message: string
    }>('/api/payments/verify', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      body: { orderNo },
      timeout: 20000,
      retry: 0,
    })

    if (!isCurrent()) return

    if (result.status === 'paid') {
      // API 已確認並同步付款。
      // 再由既有流程讀取權限、更新列表與閱讀入口。
      paymentRetry.value += 1
    } else {
      paymentMessage.value = result.message
    }
  } catch (error: unknown) {
    if (!isCurrent()) return

    const statusCode =
        error &&
        typeof error === 'object' &&
        'statusCode' in error
            ? error.statusCode
            : undefined

    paymentMessage.value =
        statusCode === 429
            ? '剛剛已查詢過，請稍候最多 5 秒再確認。'
            : '目前無法完成藍新查詢或訂單同步，請稍後再試。若已付款，請勿重複付款。'
  } finally {
    if (isCurrent()) {
      providerChecking.value = false
    }
  }
}

async function confirmOrderPayment(orderNo: string) {
  if (
      openingPaymentCheck.value ||
      providerChecking.value ||
      !user.value
  ) {
    return
  }

  openingPaymentCheck.value = true
  const userId = user.value.id

  try {
    await navigateTo({
      path: '/account',
      query: {
        ...route.query,
        paymentOrder: orderNo,
      },
    })

    // 等待網址變更觸發的 watcher 完成初始化。
    await nextTick()

    if (
        route.path !== '/account' ||
        paymentOrderNo.value !== orderNo ||
        user.value?.id !== userId
    ) {
      return
    }

    // 手動點擊時，停止等待 Supabase 的自動查詢，
    // 直接向藍新確認。
    stopPaymentPolling?.()
    paymentChecking.value = false
    paymentReadPath.value = ''

    await retryPaymentCheck()
  } finally {
    openingPaymentCheck.value = false
  }
}

async function resumePayment(orderNo: string) {
  if (
      !paymentAvailable ||
      resumingOrderNo.value ||
      openingPaymentCheck.value ||
      providerChecking.value
  ) {
    return
  }

  resumeError.value = null

  if (!user.value) {
    await navigateTo({
      path: '/login',
      query: { redirect: route.fullPath },
    })

    return
  }

  resumingOrderNo.value = orderNo

  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession()

    if (error || !session) {
      await navigateTo({
        path: '/login',
        query: { redirect: route.fullPath },
      })

      return
    }

    /*
     * 只呼叫 prepare，沿用原本的 order_no。
     * 不呼叫 create，所以不會產生第二筆訂單。
     */
    const result = await $fetch<{
      success: boolean
      payment: {
        action: string
        fields: {
          MerchantID: string
          TradeInfo: string
          TradeSha: string
          Version: string
          EncryptType: number
        }
      }
    }>('/api/payments/prepare', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      body: { orderNo },
    })

    const testGateway =
        'https://ccore.newebpay.com/MPG/mpg_gateway'

    if (
        !result.success ||
        result.payment.action !== testGateway
    ) {
      throw new Error('Invalid payment destination')
    }

    // 藍新使用表單 POST 接收付款資料。
    const form = document.createElement('form')
    form.method = 'POST'
    form.action = testGateway
    form.acceptCharset = 'UTF-8'
    form.hidden = true

    for (
        const [name, value] of
        Object.entries(result.payment.fields)
        ) {
      const input = document.createElement('input')
      input.type = 'hidden'
      input.name = name
      input.value = String(value)
      form.appendChild(input)
    }

    document.body.appendChild(form)

    try {
      form.submit()
    } finally {
      form.remove()
    }
  } catch (error: unknown) {
    const statusCode =
        error &&
        typeof error === 'object' &&
        'statusCode' in error
            ? error.statusCode
            : undefined

    const responseMessage = (
        error as {
          data?: {
            data?: {
              message?: unknown
            }
          }
        } | null
    )?.data?.data?.message

    resumeError.value = {
      orderNo,
      message:
          typeof responseMessage === 'string'
              ? responseMessage
              : statusCode === 404
                  ? '找不到這筆訂單。'
                  : statusCode === 409
                      ? '訂單已逾期、狀態已變更或章節已解鎖，請確認最新資料。'
                      : '目前無法開啟付款頁，請稍後再試。',
    }

    if (statusCode === 409) {
      await Promise.all([
        loadOrders(),
        loadChapterAccess(),
      ])
    }

    // 不輸出付款表單或加密資料。
    console.error('繼續付款失敗')
  } finally {
    resumingOrderNo.value = ''
  }
}

const paymentOrderNo = computed(() => {
  const value = route.query.paymentOrder

  return typeof value === 'string' &&
  /^[A-Za-z0-9]{1,30}$/.test(value)
      ? value
      : ''
})

const accessList = ref<ChapterAccess[]>([])
const loading = ref(false)
const errorMessage = ref('')

const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: '等待付款',
  paid: '付款成功',
  failed: '付款失敗',
  cancelled: '已取消',
  refunded: '已退款',
}

// 與 create / prepare API 的 30 分鐘期限一致。
const PENDING_ORDER_TTL = 30 * 60 * 1000

function canResumePayment(order: OrderView) {
  if (!paymentAvailable || order.status !== 'pending') {
    return false
  }

  const createdAt = Date.parse(order.created_at)

  return (
      Number.isFinite(createdAt) &&
      Date.now() - createdAt < PENDING_ORDER_TTL
  )
}

function formatOrderAmount(
    amount: number,
    currency: string,
) {
  return new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatOrderDate(value: string) {
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value))
}

async function loadBookmarks() {
  const requestId = ++bookmarksRequestId
  const userId = user.value?.id

  bookmarks.value = []
  bookmarksError.value = ''

  if (!import.meta.client || !userId) {
    bookmarksLoading.value = false
    return
  }

  bookmarksLoading.value = true

  // 請求回來時若已切換帳號或有更新的請求，就丟棄結果。
  const isCurrent = () =>
      requestId === bookmarksRequestId &&
      user.value?.id === userId

  try {
    const { bookmarks: rows, error } = await listBookmarks()

    if (!isCurrent()) return

    if (error || !rows) {
      bookmarksError.value = '無法取得閱讀書籤'
      return
    }

    const books = await queryCollection('novelBooks').all()
    const chapters = await queryCollection('novelChapters').all()

    if (!isCurrent()) return

    bookmarks.value = rows.map((bookmark) => {
      const book = books.find(
          item =>
              item.stem ===
              `novels/${bookmark.book_slug}/index`
      )

      const chapter = chapters.find(
          item =>
              item.stem ===
              `novels/${bookmark.book_slug}/${bookmark.chapter_slug}`
      )

      return {
        ...bookmark,
        bookTitle: book?.title ?? bookmark.book_slug,
        chapterTitle:
            chapter?.title ?? bookmark.chapter_slug,
      }
    })
  } catch (error) {
    if (!isCurrent()) return

    console.error('讀取閱讀書籤時發生錯誤:', error)
    bookmarksError.value = '讀取閱讀書籤時發生錯誤'
  } finally {
    if (isCurrent()) {
      bookmarksLoading.value = false
    }
  }
}

async function removeBookmark(bookmark: BookmarkView) {
  if (deletingBookmarkId.value) {
    return
  }

  const userId = user.value?.id

  if (!userId) {
    return
  }

  const confirmed = window.confirm(
      `確定要刪除這個書籤嗎？\n\n`
      + `${bookmark.bookTitle}／${bookmark.chapterTitle}（${bookmark.progress}%）\n\n`
      + `只會刪除書籤，不影響閱讀進度與購買紀錄。`
  )

  if (!confirmed) {
    return
  }

  deletingBookmarkId.value = bookmark.id
  bookmarksError.value = ''

  try {
    const success = await deleteBookmark(bookmark.id, userId)

    // 刪除期間切換帳號就不要再動畫面。
    if (user.value?.id !== userId) return

    if (!success) {
      bookmarksError.value = '刪除書籤失敗，請稍後再試。'
      return
    }

    // 直接從列表移除，不需要重新查詢。
    bookmarks.value = bookmarks.value.filter(
        item => item.id !== bookmark.id
    )
  } finally {
    if (user.value?.id === userId) {
      deletingBookmarkId.value = ''
    }
  }
}

async function loadChapterAccess() {
  if (!user.value) {
    accessList.value = []
    accessViewList.value = []
    return
  }

  loading.value = true
  errorMessage.value = ''

  try {
    const {
      data,
      error,
    } = await supabase
        .from('chapter_access')
        .select(`
        id,
        book_slug,
        chapter_slug,
        created_at
      `)
        .order('created_at', {
          ascending: false,
        })

    if (error) {
      console.error('取得已解鎖章節失敗:', error)
      errorMessage.value = '無法取得已解鎖章節'
      return
    }

    accessList.value = data ?? []

    const books = await queryCollection('novelBooks').all()
    const chapters = await queryCollection('novelChapters').all()

    accessViewList.value = accessList.value.map((access) => {
      const book = books.find(
          item => item.stem === `novels/${access.book_slug}/index`
      )

      const chapter = chapters.find(
          item =>
              item.stem ===
              `novels/${access.book_slug}/${access.chapter_slug}`
      )

      return {
        ...access,
        bookTitle: book?.title ?? access.book_slug,
        chapterTitle: chapter?.title ?? access.chapter_slug,
      }
    })
  } catch (error) {
    console.error(error)
    errorMessage.value = '讀取會員資料時發生錯誤'
  } finally {
    loading.value = false
  }
}

async function loadOrders() {
  const requestId = ++ordersRequestId
  const userId = user.value?.id
  const page = orderPage.value
  const filter = orderFilter.value

  orders.value = []
  ordersError.value = ''

  if (!import.meta.client || !userId) {
    orderTotal.value = 0
    orderCounts.value = {
      all: 0,
      pending: 0,
      paid: 0,
      other: 0,
    }
    ordersLoading.value = false
    return
  }

  ordersLoading.value = true

  const isCurrent = () =>
      requestId === ordersRequestId &&
      user.value?.id === userId &&
      orderPage.value === page &&
      orderFilter.value === filter

  try {
    let query = supabase
        .from('orders')
        .select(`
        id,
        order_no,
        book_slug,
        chapter_slug,
        amount,
        currency,
        status,
        created_at,
        paid_at
      `, { count: 'exact' })
        .eq('user_id', userId)

    if (filter === 'other') {
      query = query.not('status', 'in', '(pending,paid)')
    } else if (filter !== 'all') {
      query = query.eq('status', filter)
    }

    const from = (page - 1) * ORDER_PAGE_SIZE

    // 計數請求只回傳筆數，不下載全部訂單內容。
    const countQuery = () =>
        supabase
            .from('orders')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)

    const [pageResult, allResult, pendingResult, paidResult] =
        await Promise.all([
          query
              .order('created_at', { ascending: false })
              .order('id', { ascending: false })
              .range(from, from + ORDER_PAGE_SIZE - 1),

          countQuery(),
          countQuery().eq('status', 'pending'),
          countQuery().eq('status', 'paid'),
        ])

    if (!isCurrent()) return

    if (
        pageResult.error ||
        allResult.error ||
        pendingResult.error ||
        paidResult.error
    ) {
      throw new Error('Order query failed')
    }

    orderTotal.value = pageResult.count ?? 0

    const all = allResult.count ?? 0
    const pending = pendingResult.count ?? 0
    const paid = paidResult.count ?? 0

    orderCounts.value = {
      all,
      pending,
      paid,
      other: Math.max(0, all - pending - paid),
    }

    // 付款更新後，最後一頁可能變成空頁。
    if (page > orderPageCount.value) {
      orderPage.value = orderPageCount.value
      return
    }

    const [books, chapters] = await Promise.all([
      queryCollection('novelBooks').all(),
      queryCollection('novelChapters').all(),
    ])

    if (!isCurrent()) return

    orders.value = ((pageResult.data ?? []) as Order[])
        .map((order) => {
          const book = books.find(
              item => item.stem === `novels/${order.book_slug}/index`,
          )

          const chapter = chapters.find(
              item =>
                  item.stem ===
                  `novels/${order.book_slug}/${order.chapter_slug}`,
          )

          return {
            ...order,
            bookTitle: book?.title ?? order.book_slug,
            chapterTitle: chapter?.title ?? order.chapter_slug,
            statusLabel:
                ORDER_STATUS_LABELS[order.status] ?? order.status,
          }
        })
  } catch {
    if (!isCurrent()) return

    orders.value = []
    ordersError.value = '無法讀取訂單，請稍後重試。'
  } finally {
    if (requestId === ordersRequestId) {
      ordersLoading.value = false
    }
  }
}

async function loadRecentReadings() {
  if (!import.meta.client || !user.value) {
    recentReadings.value = []
    return
  }

  const books = await queryCollection('novelBooks').all()
  const chapters = await queryCollection('novelChapters').all()

  const readingMap = new Map<string, RecentReading>()

  /*
   * 先讀取這台裝置的 localStorage
   */
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)

    if (!key?.startsWith('novel-progress:')) {
      continue
    }

    const bookSlug = key.replace('novel-progress:', '')

    // 章節專用 key 由章節頁自行使用；會員中心只讀每本小說的最新進度。
    if (bookSlug.includes(':')) {
      continue
    }

    const value = localStorage.getItem(key)

    if (!value) {
      continue
    }

    try {
      const savedProgress = JSON.parse(value) as {
        chapter?: string
        chapterTitle?: string
        progress?: number
        updatedAt?: string
      }

      const progress = Number(savedProgress.progress)
      const updatedAt = Date.parse(savedProgress.updatedAt ?? '')

      if (
          !savedProgress.chapter ||
          !savedProgress.chapterTitle ||
          !Number.isFinite(progress) ||
          progress < 0 ||
          progress > 100 ||
          !Number.isFinite(updatedAt)
      ) {
        continue
      }

      const book = books.find(
          item => item.stem === `novels/${bookSlug}/index`
      )

      readingMap.set(bookSlug, {
        bookSlug,
        bookTitle: book?.title ?? bookSlug,
        chapterSlug: savedProgress.chapter,
        chapterTitle: savedProgress.chapterTitle,
        progress: Math.round(progress),
        updatedAt: savedProgress.updatedAt!,
      })
    } catch (error) {
      console.error('讀取本機閱讀進度失敗:', error)
    }
  }

  /*
   * 再讀取會員的 Supabase 閱讀進度
   */
  const {
    data: cloudReadings,
    error,
  } = await supabase
      .from('reading_progress')
      .select(`
      book_slug,
      chapter_slug,
      progress,
      updated_at
    `)
      .order('updated_at', {
        ascending: false,
      })

  if (error) {
    console.error('取得雲端閱讀進度失敗:', error)
  } else {
    for (const cloudReading of cloudReadings ?? []) {
      const progress = Number(cloudReading.progress)
      const cloudUpdatedAt = Date.parse(
          cloudReading.updated_at ?? ''
      )

      if (
          typeof cloudReading.book_slug !== 'string' ||
          typeof cloudReading.chapter_slug !== 'string' ||
          !Number.isFinite(progress) ||
          progress < 0 ||
          progress > 100 ||
          !Number.isFinite(cloudUpdatedAt)
      ) {
        continue
      }

      const localReading = readingMap.get(
          cloudReading.book_slug
      )

      const localUpdatedAt = localReading
          ? Date.parse(localReading.updatedAt)
          : Number.NEGATIVE_INFINITY

      // 本機資料較新時，不用雲端覆蓋
      if (localUpdatedAt >= cloudUpdatedAt) {
        continue
      }

      const book = books.find(
          item =>
              item.stem ===
              `novels/${cloudReading.book_slug}/index`
      )

      const chapter = chapters.find(
          item =>
              item.stem ===
              `novels/${cloudReading.book_slug}/${cloudReading.chapter_slug}`
      )

      const latestReading: RecentReading = {
        bookSlug: cloudReading.book_slug,
        bookTitle:
            book?.title ?? cloudReading.book_slug,
        chapterSlug: cloudReading.chapter_slug,
        chapterTitle:
            chapter?.title ?? cloudReading.chapter_slug,
        progress: Math.round(progress),
        updatedAt: cloudReading.updated_at,
      }

      readingMap.set(
          cloudReading.book_slug,
          latestReading
      )

      localStorage.setItem(
          `novel-progress:${cloudReading.book_slug}`,
          JSON.stringify({
            chapter: latestReading.chapterSlug,
            chapterTitle: latestReading.chapterTitle,
            progress: latestReading.progress,
            updatedAt: latestReading.updatedAt,
          })
      )
    }
  }

  recentReadings.value = Array.from(readingMap.values())
      .sort(
          (a, b) =>
              Date.parse(b.updatedAt) -
              Date.parse(a.updatedAt)
      )
      .slice(0, 5)
}

watch(
    [initialized, () => user.value?.id],
    async ([isInitialized]) => {
      if (!isInitialized) {
        return
      }

      await loadChapterAccess()

      if (user.value) {
        await loadRecentReadings()
      } else {
        recentReadings.value = []
      }
    },
    {
      immediate: true,
    }
)

watch(
    [
      initialized,
      () => user.value?.id,
      paymentOrderNo,
      paymentRetry,
    ],
    ([ready, userId, orderNo], _, onCleanup) => {
      providerRequestId += 1
      providerChecking.value = false
      paymentMessage.value = ''
      paymentReadPath.value = ''
      paymentChecking.value = false

      if (
          !import.meta.client ||
          !ready ||
          !userId ||
          !orderNo
      ) {
        return
      }

      let stopped = false
      let attempts = 0
      let timer: ReturnType<typeof setTimeout> | undefined

      const controller = new AbortController()

      // 離開頁面、登出或切換訂單時停止查詢。
      const stopPolling = () => {
        stopped = true
        controller.abort()
        clearTimeout(timer)
      }

      stopPaymentPolling = stopPolling

      onCleanup(() => {
        stopPolling()

        if (stopPaymentPolling === stopPolling) {
          stopPaymentPolling = undefined
        }
      })

      paymentChecking.value = true
      paymentMessage.value = '正在確認付款結果，請稍候…'

      async function checkPayment() {
        attempts += 1

        try {
          const { data: order, error } = await supabase
              .from('orders')
              .select('status, book_slug, chapter_slug')
              .eq('order_no', orderNo)
              .eq('user_id', userId)
              .abortSignal(controller.signal)
              .maybeSingle()

          if (stopped) return

          if (error) {
            throw new Error('Order query failed')
          }

          if (!order) {
            paymentChecking.value = false
            paymentMessage.value =
                '此帳號找不到這筆訂單，請確認是否登入購買時的帳號。'
            return
          }

          if (order.status === 'paid') {
            const { data: access, error: accessError } =
                await supabase
                    .from('chapter_access')
                    .select('id')
                    .eq('user_id', userId)
                    .eq('book_slug', order.book_slug)
                    .eq('chapter_slug', order.chapter_slug)
                    .limit(1)
                    .abortSignal(controller.signal)
                    .maybeSingle()

            if (stopped) return

            if (accessError) {
              throw new Error('Access query failed')
            }

            if (access) {
              // 同步更新下面的訂單與已解鎖章節區塊。
              await Promise.all([
                loadOrders(),
                loadChapterAccess(),
              ])

              if (stopped) return

              paymentChecking.value = false
              paymentMessage.value = '付款成功，章節已解鎖。'
              paymentReadPath.value =
                  `/novels/${encodeURIComponent(order.book_slug)}` +
                  `/${encodeURIComponent(order.chapter_slug)}`
              return
            }
          }

          if (
              order.status === 'failed' ||
              order.status === 'refunded'
          ) {
            paymentChecking.value = false
            paymentMessage.value =
                order.status === 'refunded'
                    ? '此訂單已退款，請查看訂單紀錄。'
                    : '此訂單顯示付款失敗；若有扣款疑慮，請聯絡客服。'

            await loadOrders()
            return
          }

          // pending、已逾時取消，或已付款但權限尚未查到：
          // 保留短暫等待通知完成的機會。
          if (attempts >= 15) {
            paymentChecking.value = false
            paymentMessage.value =
                '暫時尚未確認付款與開通結果。若已付款，請勿重複付款，可稍後重新整理或聯絡客服。'
            return
          }

          timer = setTimeout(() => {
            void checkPayment()
          }, 2000)
        } catch {
          if (stopped) return

          paymentChecking.value = false
          paymentMessage.value =
              '目前無法查詢付款結果，請稍後重新整理。若已付款，請勿重複付款。'
        }
      }

      void checkPayment()
    },
    { immediate: true },
)

onBeforeUnmount(() => {
  providerRequestId += 1
})

watch(
    () => user.value?.id,
    () => {
      // 帳號改變時立即清除上一個帳號的書籤畫面。
      bookmarksRequestId += 1
      bookmarks.value = []
      bookmarksLoading.value = false
      bookmarksError.value = ''
      deletingBookmarkId.value = ''

      // 帳號改變時立即清除上一個帳號的訂單畫面。
      ordersRequestId += 1
      orders.value = []
      orderPage.value = 1
      orderTotal.value = 0
      ordersLoading.value = false
      ordersError.value = ''
      orderCounts.value = {
        all: 0,
        pending: 0,
        paid: 0,
        other: 0,
      }
    },
    { flush: 'sync' },
)

watch(
    [initialized, () => user.value?.id, orderPage, orderFilter],
    () => {
      if (import.meta.client && initialized.value) {
        void loadOrders()
      }
    },
    { immediate: true },
)

watch(
    [initialized, () => user.value?.id],
    () => {
      if (import.meta.client && initialized.value) {
        void loadBookmarks()
      }
    },
    { immediate: true },
)

onBeforeUnmount(() => {
  ordersRequestId += 1
  bookmarksRequestId += 1
})

</script>

<template>
  <div class="account-page">
    <h1>會員中心</h1>

    <!-- Auth 還在初始化 -->
    <p v-if="!initialized">
      讀取會員資料中...
    </p>

    <!-- 尚未登入 -->
    <div
        v-else-if="!user"
        class="login-required"
    >
      <p>
        請先登入後查看會員資料。
      </p>

      <NuxtLink
          :to="{
            path: '/login',
            query: { redirect: route.fullPath },
          }"
          class="primary-link"
      >
        前往登入
      </NuxtLink>
    </div>

    <!-- 已登入 -->
    <div v-else>
      <section
          v-if="paymentMessage"
          class="payment-feedback"
          role="status"
          aria-live="polite"
          :aria-busy="paymentChecking || providerChecking"
      >
        <p>{{ paymentMessage }}</p>

        <button
            v-if="paymentOrderNo && !paymentReadPath"
            type="button"
            class="payment-retry-button"
            :disabled="paymentChecking || providerChecking"
            @click="retryPaymentCheck"
        >
          {{
            providerChecking
                ? '向藍新查詢中…'
                : paymentChecking
                    ? '確認中…'
                    : '重新確認'
          }}
        </button>

        <NuxtLink
            v-if="paymentReadPath"
            :to="paymentReadPath"
            class="primary-link"
        >
          前往閱讀
        </NuxtLink>
      </section>
      <section class="account-info">
        <h2>帳號</h2>

        <p>
          {{ user.email }}
        </p>
      </section>

      <section class="recent-section">
        <h2>最近閱讀</h2>

        <p
            v-if="recentReadings.length === 0"
            class="empty-message"
        >
          目前還沒有閱讀紀錄。
        </p>

        <div
            v-else
            class="recent-list"
        >
          <NuxtLink
              v-for="reading in recentReadings"
              :key="`${reading.bookSlug}-${reading.chapterSlug}`"
              :to="`/novels/${reading.bookSlug}/${reading.chapterSlug}`"
              class="recent-card"
          >
            <div>
              <strong>
                {{ reading.bookTitle }}
              </strong>

              <p>
                {{ reading.chapterTitle }}
              </p>
            </div>

            <div class="progress-info">
  <span>
    閱讀進度 {{ reading.progress }}%
  </span>

              <div class="progress-track">
                <div
                    class="progress-bar"
                    :style="{ width: `${reading.progress}%` }"
                />
              </div>
            </div>
          </NuxtLink>
        </div>
      </section>

      <section class="bookmarks-section">
        <h2>閱讀書籤</h2>

        <p v-if="bookmarksLoading">
          讀取中...
        </p>

        <p
            v-else-if="bookmarksError"
            class="error-message"
            role="alert"
        >
          {{ bookmarksError }}
        </p>

        <p
            v-else-if="bookmarks.length === 0"
            class="empty-message"
        >
          目前還沒有書籤。閱讀章節時可以按右下角的「＋ 加入書籤」記錄位置。
        </p>

        <div
            v-else
            class="bookmark-list"
        >
          <article
              v-for="bookmark in bookmarks"
              :key="bookmark.id"
              class="bookmark-card"
          >
            <div class="bookmark-body">
              <strong>
                {{ bookmark.bookTitle }}
              </strong>

              <p class="bookmark-chapter">
                {{ bookmark.chapterTitle }}
                <span class="bookmark-progress">
                  {{ bookmark.progress }}%
                </span>
              </p>

              <p
                  v-if="bookmark.note"
                  class="bookmark-note"
              >
                {{ bookmark.note }}
              </p>

              <p class="bookmark-date">
                {{ formatOrderDate(bookmark.created_at) }}
              </p>
            </div>

            <div class="bookmark-actions">
              <NuxtLink
                  :to="{
                    path: `/novels/${encodeURIComponent(bookmark.book_slug)}/${encodeURIComponent(bookmark.chapter_slug)}`,
                    query: { bookmark: String(bookmark.progress) },
                  }"
              >
                前往書籤
              </NuxtLink>

              <button
                  type="button"
                  class="bookmark-delete-button"
                  :disabled="Boolean(deletingBookmarkId)"
                  @click="removeBookmark(bookmark)"
              >
                {{
                  deletingBookmarkId === bookmark.id
                      ? '刪除中…'
                      : '刪除'
                }}
              </button>
            </div>
          </article>
        </div>
      </section>

      <section class="access-section">
        <h2>已解鎖章節</h2>

        <p v-if="loading">
          讀取中...
        </p>

        <p
            v-else-if="errorMessage"
            class="error-message"
        >
          {{ errorMessage }}
        </p>

        <p
            v-else-if="accessList.length === 0"
            class="empty-message"
        >
          目前還沒有已解鎖的付費章節。
        </p>

        <div
            v-else
            class="access-list"
        >
          <NuxtLink
              v-for="access in accessViewList"
              :key="access.id"
              :to="`/novels/${access.book_slug}/${access.chapter_slug}`"
              class="access-card"
          >
            <div>
              <strong>
                {{ access.bookTitle }}
              </strong>

              <p>
                {{ access.chapterTitle }}
              </p>
            </div>

            <span>
              前往閱讀
            </span>
          </NuxtLink>
        </div>
      </section>
      <section class="orders-section">
        <h2>訂單紀錄</h2>

        <p
            class="order-copy-message"
            role="status"
            aria-live="polite"
            aria-atomic="true"
        >
          {{ orderCopyMessage }}
        </p>

        <div
            class="order-filters"
            role="group"
            aria-label="篩選訂單狀態"
        >
          <button
              v-for="option in orderFilterOptions"
              :key="option.value"
              type="button"
              :aria-pressed="orderFilter === option.value"
              :disabled="ordersLoading"
              @click="selectOrderFilter(option.value)"
          >
            {{ option.label }}（{{ orderCount(option.value) }}）
          </button>
        </div>

        <p v-if="ordersLoading" role="status">正在載入訂單…</p>

        <div v-else-if="ordersError" role="alert">
          <p>{{ ordersError }}</p>
          <button type="button" class="order-check-button" @click="loadOrders()">
            重新載入
          </button>
        </div>

        <p
            v-else-if="orders.length === 0"
            class="empty-message"
            role="status"
        >
          {{
            orderCounts.all === 0
                ? '目前還沒有訂單紀錄。'
                : '目前沒有符合此狀態的訂單。'
          }}
        </p>

        <div
            v-else
            class="order-list"
        >
          <article
              v-for="order in orders"
              :key="order.id"
              class="order-card"
          >
            <!-- 訂單內容 -->
            <div>
              <strong>
                {{ order.order_no }}
              </strong>

              <p>
                {{ order.bookTitle }}／{{ order.chapterTitle }}
              </p>

              <details class="order-details">
                <summary>查看訂單明細</summary>

                <dl>
                  <dt>訂單編號</dt>
                  <dd>
                    <span>{{ order.order_no }}</span>

                    <button
                        type="button"
                        class="order-copy-button"
                        :aria-label="`複製訂單編號 ${order.order_no}`"
                        @click="copyOrderNumber(order.order_no)"
                    >
                      複製
                    </button>
                  </dd>

                  <dt>購買內容</dt>
                  <dd>{{ order.bookTitle }}／{{ order.chapterTitle }}</dd>

                  <dt>訂單金額</dt>
                  <dd>{{ formatOrderAmount(order.amount, order.currency) }}</dd>

                  <dt>訂單狀態</dt>
                  <dd>{{ order.statusLabel }}</dd>

                  <dt>建立日期</dt>
                  <dd>{{ formatOrderDate(order.created_at) }}</dd>

                  <dt>付款日期</dt>
                  <dd>
                    {{ order.paid_at ? formatOrderDate(order.paid_at) : '尚無付款紀錄' }}
                  </dd>
                </dl>
              </details>

              <div
                  v-if="order.status === 'pending'"
                  class="order-actions"
              >
                <button
                    v-if="canResumePayment(order)"
                    type="button"
                    class="order-resume-button"
                    :disabled="
                      Boolean(resumingOrderNo) ||
                      openingPaymentCheck ||
                      providerChecking
                    "
                    @click="resumePayment(order.order_no)"
                >
                  {{
                    resumingOrderNo === order.order_no
                        ? '前往藍新中…'
                        : '繼續付款'
                  }}
                </button>

                <button
                    type="button"
                    class="order-check-button"
                    :disabled="
                      openingPaymentCheck ||
                      providerChecking ||
                      Boolean(resumingOrderNo)
                    "
                    @click="confirmOrderPayment(order.order_no)"
                >
                  {{
                    (openingPaymentCheck || providerChecking) &&
                    paymentOrderNo === order.order_no
                        ? '向藍新查詢中…'
                        : '確認付款狀態'
                  }}
                </button>

                <NuxtLink
                    :to="`/novels/${encodeURIComponent(order.book_slug)}/${encodeURIComponent(order.chapter_slug)}`"
                >
                  前往章節
                </NuxtLink>
              </div>
              <p
                  v-if="canResumePayment(order)"
                  class="order-payment-hint"
              >
                「繼續付款」會先確認交易狀態。
                若已完成付款，請按「確認付款狀態」，勿再次付款。
              </p>

              <p
                  v-if="
                    order.status === 'pending' &&
                    paymentAvailable &&
                    !canResumePayment(order)
                  "
                  class="order-payment-hint"
              >
                此訂單已超過 30 分鐘付款期限，請回章節頁重新購買。
              </p>

              <p
                  v-if="resumeError?.orderNo === order.order_no"
                  class="order-payment-error"
                  role="alert"
              >
                {{ resumeError.message }}
              </p>

            </div>

            <!-- 金額與狀態 -->
            <div class="order-meta">
              <strong>
                {{
                  formatOrderAmount(
                      order.amount,
                      order.currency
                  )
                }}
              </strong>

              <span
                  class="order-status"
                  :class="{
          'order-status--pending':
            order.status === 'pending',
          'order-status--paid':
            order.status === 'paid',
          'order-status--failed':
            order.status === 'failed',
          'order-status--cancelled':
            order.status === 'cancelled',
          'order-status--refunded':
            order.status === 'refunded',
        }"
              >
      {{ order.statusLabel }}
    </span>

              <time
                  :datetime="order.paid_at ?? order.created_at"
              >
                {{
                  order.paid_at
                      ? `付款日期：${formatOrderDate(order.paid_at)}`
                      : `建立日期：${formatOrderDate(order.created_at)}`
                }}
              </time>
            </div>
          </article>
        </div>
        <nav
            v-if="orderTotal > 0 && !ordersError"
            class="order-pagination"
            aria-label="訂單分頁"
        >
          <button
              type="button"
              :disabled="ordersLoading || orderPage <= 1"
              @click="orderPage -= 1"
          >
            上一頁
          </button>
          <span role="status">
            第 {{ orderPage }}／{{ orderPageCount }} 頁，共 {{ orderTotal }} 筆
          </span>
          <button
              type="button"
              :disabled="ordersLoading || orderPage >= orderPageCount"
              @click="orderPage += 1"
          >
            下一頁
          </button>
        </nav>
      </section>
    </div>
  </div>
</template>

<style scoped>
.account-page {
  max-width: 720px;
  margin: 0 auto;
}

.account-page h1 {
  margin-top: 0;
  margin-bottom: 32px;

  font-size: 32px;
}

.account-info,
.recent-section,
.access-section,
.orders-section {
  margin-bottom: 40px;
}

.account-info h2,
.recent-section h2,
.access-section h2,
.orders-section h2 {
  margin-bottom: 16px;

  font-size: 22px;
}

.login-required {
  padding: 24px;

  border: 1px solid #e5e5e5;
  border-radius: 10px;
}

.primary-link {
  display: inline-block;

  margin-top: 8px;
  padding: 10px 16px;

  border-radius: 8px;
  background: #222;

  text-decoration: none;
  color: white;
  font-weight: 700;
}

.recent-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.recent-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;

  padding: 18px 20px;

  border: 1px solid #e5e5e5;
  border-radius: 10px;

  text-decoration: none;
  color: #222;
}

.recent-card:hover {
  border-color: #aaa;
}

.recent-card p {
  margin: 6px 0 0;
  color: #666;
}

.progress-info {
  width: 150px;
  flex-shrink: 0;

  font-size: 13px;
  color: #666;
}

.progress-track {
  height: 6px;
  margin-top: 8px;

  overflow: hidden;

  border-radius: 999px;
  background: #e5e5e5;
}

.progress-bar {
  height: 100%;

  border-radius: 999px;
  background: #222;
}

.access-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.access-card {
  display: flex;
  align-items: center;
  justify-content: space-between;

  padding: 18px 20px;

  border: 1px solid #e5e5e5;
  border-radius: 10px;

  text-decoration: none;
  color: #222;
}

.access-card:hover {
  border-color: #aaa;
}

.access-card p {
  margin: 6px 0 0;
  color: #666;
}

.order-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.order-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;

  padding: 18px 20px;

  border: 1px solid #e5e5e5;
  border-radius: 10px;
}

.order-card p {
  margin: 6px 0 0;
  color: #666;
}

.order-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;

  flex-shrink: 0;

  font-size: 13px;
  color: #666;
}

.order-status {
  display: inline-block;

  padding: 3px 8px;

  border-radius: 999px;

  font-weight: 600;
}

.order-status--pending {
  background: #fff7db;
  color: #846500;
}

.order-status--paid {
  background: #e8f6ed;
  color: #277443;
}

.order-status--failed,
.order-status--cancelled {
  background: #f3f3f3;
  color: #666;
}

.order-status--refunded {
  background: #eaf1fb;
  color: #315f96;
}

.empty-message {
  color: #666;
}

.error-message {
  color: #b91c1c;
}

@media (max-width: 600px) {
  .account-page h1 {
    font-size: 28px;
  }

  .recent-card,
  .access-card {
    align-items: flex-start;
    flex-direction: column;
    gap: 12px;
  }

  .progress-info {
    width: 100%;
  }

  .order-card {
    align-items: flex-start;
    flex-direction: column;
    gap: 12px;
  }

  .order-meta {
    align-items: flex-start;
  }
}

.payment-feedback {
  margin-bottom: 24px;
  padding: 16px;
  border: 1px solid #ccc;
  border-radius: 10px;
}

.payment-feedback p {
  margin: 0 0 8px;
}

.order-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}

/*
 * 動作列三顆一致，採用 Bootstrap 5 .btn-primary 的數值。
 *
 * 錯誤狀態的「重新載入」共用 .order-check-button，
 * 那裡要維持純連結樣式，所以必須加上父層限定。
 */
.order-actions a,
.order-actions .order-check-button,
.order-actions .order-resume-button {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  min-height: 38px;
  padding: 6px 12px;
  border: 1px solid #0d6efd;
  border-radius: 6px;
  background: #0d6efd;
  color: #fff;
  font-family: inherit;
  font-size: 16px;
  font-weight: 400;
  line-height: 1.5;
  text-align: center;
  text-decoration: none;
  cursor: pointer;
  transition:
      color 0.15s ease-in-out,
      background-color 0.15s ease-in-out,
      border-color 0.15s ease-in-out,
      box-shadow 0.15s ease-in-out;
}

.order-actions a:hover,
.order-actions .order-check-button:not(:disabled):hover,
.order-actions .order-resume-button:not(:disabled):hover {
  background: #0b5ed7;
  border-color: #0a58ca;
  color: #fff;
}

.order-actions a:active,
.order-actions .order-check-button:not(:disabled):active,
.order-actions .order-resume-button:not(:disabled):active {
  background: #0a58ca;
  border-color: #0a53be;
}

/* Bootstrap 用 box-shadow 光暈取代 outline。 */
.order-actions a:focus-visible,
.order-actions .order-check-button:focus-visible,
.order-actions .order-resume-button:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 4px rgba(49, 132, 253, 0.5);
}

.order-actions .order-check-button:disabled,
.order-actions .order-resume-button:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.order-check-button {
  padding: 0;
  border: 0;
  background: transparent;
  color: #245a91;
  font: inherit;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}

.order-resume-button {
  padding: 8px 14px;
  border: 1px solid #245a91;
  border-radius: 6px;
  background: #245a91;
  color: #fff;
  font: inherit;
  cursor: pointer;
}

.order-payment-error {
  margin-top: 8px;
  font-size: 13px;
  color: #a4262c;
  overflow-wrap: anywhere;
}

.bookmark-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.bookmark-card {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px 16px;
  padding: 16px;
  border: 1px solid #ddd;
  border-radius: 10px;
}

.bookmark-body {
  min-width: 0;
  flex: 1 1 240px;
}

.bookmark-chapter {
  margin: 4px 0 0;
}

.bookmark-progress {
  margin-left: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  background: #e8eff7;
  color: #245a91;
  font-size: 13px;
  font-weight: 600;
}

.bookmark-note {
  margin: 8px 0 0;
  padding-left: 10px;
  border-left: 3px solid #ddd;
  font-size: 14px;
  overflow-wrap: anywhere;
}

.bookmark-date {
  margin: 8px 0 0;
  font-size: 13px;
  color: #666;
}

.bookmark-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.bookmark-actions a,
.bookmark-delete-button {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  min-height: 38px;
  padding: 6px 12px;
  border: 1px solid #0d6efd;
  border-radius: 6px;
  background: transparent;
  color: #0d6efd;
  font-family: inherit;
  font-size: 16px;
  line-height: 1.5;
  text-decoration: none;
  cursor: pointer;
}

.bookmark-delete-button {
  border-color: #a4262c;
  color: #a4262c;
}

.bookmark-delete-button:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.order-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.order-filters button,
.order-pagination button {
  box-sizing: border-box;
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid #ccc;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.order-filters button[aria-pressed="true"] {
  border-color: #222;
  background: #222;
  color: #fff;
}

.order-filters button:focus-visible,
.order-pagination button:focus-visible {
  outline: 2px solid #245a91;
  outline-offset: 3px;
}

.order-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 20px;
}

.order-filters button:disabled,
.order-pagination button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.order-details {
  margin-top: 12px;
}

.order-details summary {
  cursor: pointer;
  width: fit-content;
}

.order-details summary:focus-visible {
  outline: 2px solid #245a91;
  outline-offset: 3px;
}

.order-details dl {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 8px 12px;
  margin: 12px 0;
  font-size: 14px;
}

.order-details dt {
  font-weight: 600;
}

.order-details dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.order-copy-button {
  margin-left: 8px;
  padding: 3px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.order-copy-button:focus-visible {
  outline: 2px solid #245a91;
  outline-offset: 3px;
}

.order-copy-message {
  font-size: 14px;
  overflow-wrap: anywhere;
}

.order-copy-message:empty {
  margin: 0;
}

@media (prefers-reduced-motion: reduce) {
  .order-actions a,
  .order-actions .order-check-button,
  .order-actions .order-resume-button {
    transition: none;
  }
}

</style>
