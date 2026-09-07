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

const accessViewList = ref<AccessView[]>([])
const recentReadings = ref<RecentReading[]>([])
const orders = ref<Order[]>([])

const {
  user,
  initialized,
} = useAuth()

const supabase = useSupabase()

const accessList = ref<ChapterAccess[]>([])
const loading = ref(false)
const errorMessage = ref('')

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

  orders.value = (data ?? []) as Order[]
}

async function loadRecentReadings() {
  if (!import.meta.client) {
    return
  }

  const books = await queryCollection('novelBooks').all()

  const result: RecentReading[] = []

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
      const progress = JSON.parse(value) as {
        chapter?: string
        chapterTitle?: string
        progress?: number
        updatedAt?: string
      }

      if (
          !progress.chapter ||
          !progress.chapterTitle ||
          typeof progress.progress !== 'number' ||
          !progress.updatedAt
      ) {
        continue
      }

      const book = books.find(
          item => item.stem === `novels/${bookSlug}/index`
      )

      result.push({
        bookSlug,
        bookTitle: book?.title ?? bookSlug,
        chapterSlug: progress.chapter,
        chapterTitle: progress.chapterTitle,
        progress: progress.progress,
        updatedAt: progress.updatedAt,
      })
    } catch (error) {
      console.error('讀取閱讀進度失敗:', error)
    }
  }

  recentReadings.value = result
      .sort(
          (a, b) =>
              new Date(b.updatedAt).getTime() -
              new Date(a.updatedAt).getTime()
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
            <div>
              <strong>
                {{ order.order_no }}
              </strong>

              <p>
                {{ order.book_slug }}／{{ order.chapter_slug }}
              </p>
            </div>

            <div class="order-meta">
              <strong>
                {{ order.currency }} {{ order.amount }}
              </strong>

              <span>
          {{ order.status }}
        </span>

              <time :datetime="order.created_at">
                {{ new Date(order.created_at).toLocaleDateString('zh-TW') }}
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