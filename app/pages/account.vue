<script setup lang="ts">
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

function matchesOrderFilter(
    order: OrderView,
    filter: OrderFilter,
) {
  if (filter === 'all') return true

  if (filter === 'other') {
    return order.status !== 'pending' &&
        order.status !== 'paid'
  }

  return order.status === filter
}

const filteredOrders = computed(() =>
    orders.value.filter(order =>
        matchesOrderFilter(order, orderFilter.value),
    ),
)

function orderCount(filter: OrderFilter) {
  return orders.value.filter(order =>
      matchesOrderFilter(order, filter),
  ).length
}

const {
  user,
  initialized,
} = useAuth()

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
            ? '剛剛已查詢過，請稍候最多 30 秒再確認。'
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
  if (!user.value) {
    orders.value = []
    return
  }

  const {
    data,
    error,
  } = await supabase
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
      `)
      .order('created_at', {
        ascending: false,
      })

  if (error) {
    console.error('取得訂單紀錄失敗:', error)
    orders.value = []
    return
  }

  const books = await queryCollection('novelBooks').all()
  const chapters = await queryCollection('novelChapters').all()

  orders.value = ((data ?? []) as Order[]).map((order) => {
    const book = books.find(
        item =>
            item.stem ===
            `novels/${order.book_slug}/index`
    )

    const chapter = chapters.find(
        item =>
            item.stem ===
            `novels/${order.book_slug}/${order.chapter_slug}`
    )

    return {
      ...order,
      bookTitle: book?.title ?? order.book_slug,
      chapterTitle:
          chapter?.title ?? order.chapter_slug,
      statusLabel:
          ORDER_STATUS_LABELS[order.status] ??
          order.status,
    }
  })
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
      await loadOrders()

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

        <div
            v-if="orders.length > 0"
            class="order-filters"
            role="group"
            aria-label="篩選訂單狀態"
        >
          <button
              v-for="option in orderFilterOptions"
              :key="option.value"
              type="button"
              :aria-pressed="orderFilter === option.value"
              @click="orderFilter = option.value"
          >
            {{ option.label }}（{{ orderCount(option.value) }}）
          </button>
        </div>

        <p
            v-if="filteredOrders.length === 0"
            class="empty-message"
            role="status"
        >
          {{
            orders.length === 0
                ? '目前還沒有訂單紀錄。'
                : '目前沒有符合此狀態的訂單。'
          }}
        </p>

        <div
            v-else
            class="order-list"
        >
          <article
              v-for="order in filteredOrders"
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

              <div
                  v-if="order.status === 'pending'"
                  class="order-actions"
              >
                <NuxtLink
                    :to="`/novels/${encodeURIComponent(order.book_slug)}/${encodeURIComponent(order.chapter_slug)}`"
                >
                  前往章節
                </NuxtLink>

                <button
                    type="button"
                    class="order-check-button"
                    :disabled="openingPaymentCheck || providerChecking"
                    @click="confirmOrderPayment(order.order_no)"
                >
                  {{
                    (openingPaymentCheck || providerChecking) &&
                    paymentOrderNo === order.order_no
                        ? '向藍新查詢中…'
                        : '確認付款狀態'
                  }}
                </button>
              </div>

              <p
                  v-if="order.status === 'pending'"
                  class="order-payment-hint"
              >
                若已完成付款，請先確認付款狀態，勿重複付款。
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
  gap: 8px 16px;
  margin-top: 12px;
}

.order-actions a {
  color: #245a91;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.order-card .order-payment-hint {
  margin-top: 8px;
  font-size: 13px;
}

.payment-retry-button {
  padding: 8px 14px;
  border: 1px solid #aaa;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.payment-retry-button:disabled {
  opacity: 0.6;
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

.order-check-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.order-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.order-filters button {
  padding: 8px 12px;
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

.order-filters button:focus-visible {
  outline: 2px solid #245a91;
  outline-offset: 3px;
}

</style>
