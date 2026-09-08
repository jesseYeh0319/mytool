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

const {
  user,
  initialized,
} = useAuth()

const supabase = useSupabase()

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
          to="/login?redirect=/account"
          class="primary-link"
      >
        前往登入
      </NuxtLink>
    </div>

    <!-- 已登入 -->
    <div v-else>
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

        <p
            v-if="orders.length === 0"
            class="empty-message"
        >
          目前還沒有訂單紀錄。
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
</style>