<script setup lang="ts">
const route = useRoute()

const {
  user,
  initialized,
} = useAuth()

const {
  hasAccess,
} = useChapterAccess()

const {
  getPaidChapterContent,
} = usePaidChapterContent()

const {
  saveReadingProgressToCloud,
} = useReadingProgress()

const slug = route.params.slug as string
const chapterSlug = route.params.chapter as string

/*
 * 從網址帶入的書籤位置。
 *
 * 在 setup 階段就固定下來，
 * 之後把 query 從網址移除也不影響這個值。
 */
const bookmarkTarget = (() => {
  const raw = route.query.bookmark

  if (
      typeof raw !== 'string' ||
      !/^(?:100|[1-9][0-9]?|0)$/.test(raw)
  ) {
    return null
  }

  return Number(raw)
})()
const paymentAvailable = import.meta.dev
const purchaseConsent = ref(false)
const orderCreating = ref(false)
const createdOrderNo = ref('')
const purchaseError = ref('')
const orderReused = ref(false)
const pendingOrderLoading = ref(false)
const paymentSubmitting = ref(false)

type ReadingMode = 'light' | 'sepia' | 'dark'

const fontSize = ref(18)
const readingMode = ref<ReadingMode>('light')
const novelContent = ref<HTMLElement | null>(null)

const FONT_SIZE_KEY = 'novel-font-size'
const READING_MODE_KEY = 'novel-reading-mode'
// 每本小說的最新閱讀位置，供小說列表與會員中心顯示。
const BOOK_PROGRESS_KEY = `novel-progress:${slug}`

// 每個章節各自保存位置，避免閱讀其他章節時覆蓋。
const CHAPTER_PROGRESS_KEY = `novel-progress:${slug}:${chapterSlug}`

let progressAnimationFrame: number | null = null
let progressInitialized = false
let cloudSyncPromise: Promise<void> | null = null

type SavedReadingProgress = {
  chapter: string
  progress: number
}

/*
 * 從瀏覽器讀取閱讀設定
 *
 * localStorage 只存在瀏覽器端，
 * 所以必須放在 onMounted 裡。
 */
onMounted(async () => {
  const savedFontSize = localStorage.getItem(FONT_SIZE_KEY)
  const savedReadingMode = localStorage.getItem(READING_MODE_KEY)

  if (savedFontSize) {
    const parsedFontSize = Number(savedFontSize)

    if (
        !Number.isNaN(parsedFontSize) &&
        parsedFontSize >= 14 &&
        parsedFontSize <= 24
    ) {
      fontSize.value = parsedFontSize
    }
  }

  if (
      savedReadingMode === 'light' ||
      savedReadingMode === 'sepia' ||
      savedReadingMode === 'dark'
  ) {
    readingMode.value = savedReadingMode
  }

  await enableProgressTracking()
})

onBeforeRouteLeave(async () => {
  await syncCurrentProgressToCloud()
})

onBeforeRouteUpdate(async () => {
  await syncCurrentProgressToCloud()
})

onBeforeUnmount(() => {
  disableProgressTracking()

  if (progressAnimationFrame !== null) {
    cancelAnimationFrame(progressAnimationFrame)
  }
})

/*
 * 字體大小改變時自動儲存
 */
watch(fontSize, (newSize) => {
  if (import.meta.client) {
    localStorage.setItem(
        FONT_SIZE_KEY,
        String(newSize)
    )

    nextTick(scheduleProgressUpdate)
  }
})

/*
 * 閱讀模式改變時自動儲存
 */
watch(readingMode, (newMode) => {
  if (import.meta.client) {
    localStorage.setItem(
        READING_MODE_KEY,
        newMode
    )
  }
})

/*
 * 取得目前章節
 */
const { data: chapter } = await useAsyncData(
    `novel-chapter-${slug}-${chapterSlug}`,
    () => {
      return queryCollection('novelChapters')
          .where(
              'stem',
              '=',
              `novels/${slug}/${chapterSlug}`
          )
          .first()
    }
)

if (!chapter.value) {
  throw createError({
    statusCode: 404,
    statusMessage: '找不到這個章節'
  })
}

const isPaidChapter = computed(() => {
  return chapter.value?.isFree === false
})

const hasPaidAccess = ref(false)
const paidChapterBody = ref<string | null>(null)
const paidContentError = ref(false)
const accessLoading = ref(isPaidChapter.value)
let accessRequestId = 0

const canReadChapter = computed(() => {
  return !isPaidChapter.value || (
      hasPaidAccess.value &&
      paidChapterBody.value !== null
  )
})

async function refreshChapterAccess() {
  const requestId = ++accessRequestId

  paidChapterBody.value = null
  paidContentError.value = false

  if (!isPaidChapter.value) {
    hasPaidAccess.value = true
    accessLoading.value = false
    return
  }

  if (!initialized.value) {
    hasPaidAccess.value = false
    accessLoading.value = true
    return
  }

  if (!user.value) {
    hasPaidAccess.value = false
    accessLoading.value = false
    return
  }

  accessLoading.value = true

  try {
    const result = await hasAccess(slug, chapterSlug)

    if (requestId !== accessRequestId) {
      return
    }

    hasPaidAccess.value = result

    if (!result) {
      return
    }

    const body = await getPaidChapterContent(slug, chapterSlug)

    if (requestId !== accessRequestId) {
      return
    }

    if (body === null) {
      paidContentError.value = true
      return
    }

    paidChapterBody.value = body
  } catch (error) {
    console.error('取得付費章節失敗:', error)

    if (requestId === accessRequestId) {
      hasPaidAccess.value = false
      paidChapterBody.value = null
      paidContentError.value = true
    }
  } finally {
    if (requestId === accessRequestId) {
      accessLoading.value = false
    }
  }
}

watch(
    [initialized, () => user.value?.id],
    async () => {
      await refreshChapterAccess()
      await loadPendingOrder()
    },
    { immediate: true }
)

watch(canReadChapter, async (canRead) => {
  if (canRead) {
    await enableProgressTracking()
  } else {
    disableProgressTracking()
  }
}, { flush: 'post' })

async function loadPendingOrder() {
  createdOrderNo.value = ''
  orderReused.value = false

  if (
      !import.meta.client ||
      !initialized.value ||
      !user.value ||
      !isPaidChapter.value
  ) {
    return
  }

  pendingOrderLoading.value = true

  try {
    const supabase = useSupabase()

    const pendingOrderCutoff = new Date(
        Date.now() - 30 * 60 * 1000
    ).toISOString()

    const {
      data,
      error,
    } = await supabase
        .from('orders')
        .select(`
        order_no,
        created_at
      `)
        .eq('book_slug', slug)
        .eq('chapter_slug', chapterSlug)
        .eq('status', 'pending')
        .eq('payment_provider', 'newebpay')
        .gte('created_at', pendingOrderCutoff)
        .order('created_at', {
          ascending: false,
        })
        .limit(1)
        .maybeSingle()

    if (error) {
      console.error(
          '取得待付款訂單失敗:',
          error
      )
      return
    }

    if (data) {
      createdOrderNo.value = data.order_no
      orderReused.value = true
    }
  } finally {
    pendingOrderLoading.value = false
  }
}

async function handlePurchase() {
  purchaseError.value = ''
  orderReused.value = false

  if (!user.value) {
    await navigateTo({
      path: '/login',
      query: {
        redirect: route.fullPath,
      },
    })

    return
  }

  if (
      !purchaseConsent.value ||
      orderCreating.value ||
      createdOrderNo.value
  ) {
    return
  }

  orderCreating.value = true

  try {
    const supabase = useSupabase()

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError || !session) {
      await navigateTo({
        path: '/login',
        query: {
          redirect: route.fullPath,
        },
      })

      return
    }

    const result = await $fetch<{
      success: boolean
      reused: boolean
      order: {
        order_no: string
      }
    }>('/api/payments/create', {
      method: 'POST',

      headers: {
        Authorization:
            `Bearer ${session.access_token}`,
      },

      body: {
        bookSlug: slug,
        chapterSlug,
      },
    })

    createdOrderNo.value = result.order.order_no
    orderReused.value = result.reused
  } catch (error) {
    console.error('建立訂單失敗:', error)
    purchaseError.value =
        '目前無法建立訂單，請稍後再試。'
  } finally {
    orderCreating.value = false
  }
}

async function handlePayment() {
  if (
      !import.meta.client ||
      !paymentAvailable ||
      !createdOrderNo.value ||
      paymentSubmitting.value
  ) {
    return
  }

  purchaseError.value = ''
  paymentSubmitting.value = true

  try {
    const supabase = useSupabase()

    const {
      data: { session },
      error,
    } = await supabase.auth.getSession()

    if (error || !session) {
      await navigateTo({
        path: '/login',
        query: {
          redirect: route.fullPath,
        },
      })

      return
    }

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
      body: {
        orderNo: createdOrderNo.value,
      },
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

    purchaseError.value =
        typeof responseMessage === 'string'
            ? responseMessage
            : statusCode === 409
                ? '訂單已逾期、狀態已變更或章節已解鎖，請確認最新資料。'
                : '目前無法開啟付款頁，請稍後再試。'

    if (statusCode === 409) {
      await refreshChapterAccess()
    }

    // 不輸出付款表單或加密資料。
    console.error('開啟付款頁失敗')
  } finally {
    paymentSubmitting.value = false
  }
}

async function enableProgressTracking() {
  if (
      !import.meta.client ||
      !canReadChapter.value ||
      progressInitialized
  ) {
    return
  }

  await restoreReadingProgress()

  if (!canReadChapter.value || !novelContent.value) {
    return
  }

  progressInitialized = true
  window.addEventListener('scroll', scheduleProgressUpdate, {
    passive: true
  })
  window.addEventListener('resize', scheduleProgressUpdate)
}

function disableProgressTracking() {
  if (!import.meta.client) {
    return
  }

  window.removeEventListener('scroll', scheduleProgressUpdate)
  window.removeEventListener('resize', scheduleProgressUpdate)
  progressInitialized = false
}

/*
 * 以小說正文區域計算並儲存閱讀進度
 */
function saveReadingProgress() {
  if (
      !canReadChapter.value ||
      !progressInitialized ||
      !novelContent.value ||
      !chapter.value
  ) {
    return
  }

  const contentRect = novelContent.value.getBoundingClientRect()
  const readableDistance = Math.max(
      contentRect.height - window.innerHeight,
      1
  )
  const readDistance = -contentRect.top
  const progress = Math.round(
      Math.min(
          Math.max(readDistance / readableDistance, 0),
          1
      ) * 100
  )

  const savedProgress = JSON.stringify({
    chapter: chapterSlug,
    chapterTitle: chapter.value.title,
    progress,
    updatedAt: new Date().toISOString()
  })

  // 保留整本小說的最新進度，供「繼續閱讀」使用。
  localStorage.setItem(BOOK_PROGRESS_KEY, savedProgress)

  // 另外保存目前章節自己的進度，供再次進入本章時恢復。
  localStorage.setItem(CHAPTER_PROGRESS_KEY, savedProgress)
}

async function syncCurrentProgressToCloud() {
  if (
      !import.meta.client ||
      !user.value ||
      !canReadChapter.value
  ) {
    return
  }

  // 先把離開前的最新位置寫進 localStorage
  saveReadingProgress()

  // 若背景同步仍在執行，先等它結束
  if (cloudSyncPromise) {
    await cloudSyncPromise
  }

  let savedProgress: SavedReadingProgress | null = null

  try {
    const savedValue = localStorage.getItem(CHAPTER_PROGRESS_KEY)

    if (savedValue) {
      savedProgress = JSON.parse(
          savedValue
      ) as SavedReadingProgress
    }
  } catch {
    savedProgress = null
  }

  if (
      savedProgress?.chapter !== chapterSlug ||
      !Number.isFinite(savedProgress.progress)
  ) {
    return
  }

  const progress = Math.min(
      Math.max(savedProgress.progress, 0),
      100
  )

  cloudSyncPromise = (async () => {
    await saveReadingProgressToCloud({
      userId: user.value!.id,
      bookSlug: slug,
      chapterSlug,
      progress,
    })
  })()

  try {
    await cloudSyncPromise
  } finally {
    cloudSyncPromise = null
  }
}

function scheduleProgressUpdate() {
  if (
      !canReadChapter.value ||
      !progressInitialized ||
      progressAnimationFrame !== null
  ) {
    return
  }

  progressAnimationFrame = requestAnimationFrame(() => {
    progressAnimationFrame = null
    saveReadingProgress()
  })
}

/*
 * 正文渲染完成後，恢復目前章節上次閱讀的位置
 */
async function restoreReadingProgress() {
  // 付費權限檢查維持不變，書籤不會繞過它。
  if (!canReadChapter.value) {
    return
  }

  let savedProgress: SavedReadingProgress | null = null

  // 有書籤時本次不讀 localStorage，避免被閱讀進度覆蓋。
  if (bookmarkTarget === null) {
    try {
      const savedValue =
          localStorage.getItem(CHAPTER_PROGRESS_KEY) ??
          localStorage.getItem(BOOK_PROGRESS_KEY)

      if (savedValue) {
        savedProgress = JSON.parse(savedValue) as SavedReadingProgress
      }
    } catch {
      savedProgress = null
    }
  }

  await nextTick()

  if (document.fonts?.ready) {
    await document.fonts.ready
  }

  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })

  if (!novelContent.value) {
    return
  }

  let progress: number

  if (bookmarkTarget !== null) {
    progress = bookmarkTarget

    /*
     * 用過就把 query 從網址移除，
     * 之後重新整理才會回到一般的閱讀進度。
     *
     * 用 history.replaceState 而不是 navigateTo，
     * 避免觸發 onBeforeRouteUpdate 的進度同步。
     */
    window.history.replaceState(
        window.history.state,
        '',
        route.path,
    )
  } else {
    if (
        savedProgress?.chapter !== chapterSlug ||
        !Number.isFinite(savedProgress.progress)
    ) {
      return
    }

    // 舊版只有每本小說一筆資料；讀到後順便遷移成本章資料。
    if (!localStorage.getItem(CHAPTER_PROGRESS_KEY)) {
      localStorage.setItem(
          CHAPTER_PROGRESS_KEY,
          JSON.stringify(savedProgress)
      )
    }

    progress = Math.min(
        Math.max(savedProgress.progress, 0),
        100
    )
  }

  const contentRect = novelContent.value.getBoundingClientRect()
  const contentTop = window.scrollY + contentRect.top
  const readableDistance = Math.max(
      contentRect.height - window.innerHeight,
      1
  )

  window.scrollTo({
    top: contentTop + readableDistance * (progress / 100),
    behavior: 'auto'
  })

  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

/*
 * 取得小說資料
 */
const { data: book } = await useAsyncData(
    `novel-book-${slug}`,
    () => {
      return queryCollection('novelBooks')
          .where(
              'stem',
              '=',
              `novels/${slug}/index`
          )
          .first()
    }
)

/*
 * 取得所有章節
 */
const { data: chapters } = await useAsyncData(
    `novel-navigation-${slug}`,
    () => {
      return queryCollection('novelChapters')
          .where(
              'stem',
              'LIKE',
              `novels/${slug}/%`
          )
          .order('chapter', 'ASC')
          .all()
    }
)

/*
 * 找出目前章節位置
 */
const currentIndex = computed(() => {
  return chapters.value?.findIndex(
      item => item.path === chapter.value?.path
  ) ?? -1
})

/*
 * 上一章
 */
const previousChapter = computed(() => {
  if (
      !chapters.value ||
      currentIndex.value <= 0
  ) {
    return null
  }

  return chapters.value[
  currentIndex.value - 1
      ]
})

/*
 * 下一章
 */
const nextChapter = computed(() => {
  if (
      !chapters.value ||
      currentIndex.value < 0 ||
      currentIndex.value >=
      chapters.value.length - 1
  ) {
    return null
  }

  return chapters.value[
  currentIndex.value + 1
      ]
})

function increaseFontSize() {
  if (fontSize.value < 24) {
    fontSize.value += 1
  }
}

function decreaseFontSize() {
  if (fontSize.value > 14) {
    fontSize.value -= 1
  }
}

// 閱讀書籤
const bookmarkOpen = ref(false)
const bookmarkNote = ref('')
const bookmarkProgress = ref(0)
const bookmarkSaving = ref(false)
const bookmarkMessage = ref('')

let bookmarkMessageTimer: ReturnType<typeof setTimeout> | null = null

onBeforeUnmount(() => {
  if (bookmarkMessageTimer !== null) {
    clearTimeout(bookmarkMessageTimer)
  }
})

function openBookmark() {
  bookmarkMessage.value = ''

  if (
      !user.value ||
      !canReadChapter.value ||
      !progressInitialized ||
      !novelContent.value
  ) {
    bookmarkMessage.value = '閱讀內容尚未準備完成，請稍後再試。'
    return
  }

  // 開啟輸入框前先記住位置，避免手機鍵盤改變視窗高度。
  const rect = novelContent.value.getBoundingClientRect()
  const readableDistance = Math.max(
      rect.height - window.innerHeight,
      1,
  )

  bookmarkProgress.value = Math.round(
      Math.min(Math.max(-rect.top / readableDistance, 0), 1) * 100,
  )

  bookmarkNote.value = ''
  bookmarkOpen.value = true
}

async function saveBookmark() {
  if (bookmarkSaving.value) return

  const userId = user.value?.id

  if (!userId || !canReadChapter.value || !bookmarkOpen.value) {
    return
  }

  const note = bookmarkNote.value.trim()

  if (note.length > 200) {
    bookmarkMessage.value = '備註最多 200 個字。'
    return
  }

  bookmarkSaving.value = true
  bookmarkMessage.value = ''

  try {
    const supabase = useSupabase()

    const { error } = await supabase
        .from('reading_bookmarks')
        .insert({
          user_id: userId,
          book_slug: slug,
          chapter_slug: chapterSlug,
          progress: bookmarkProgress.value,
          note,
        })

    // 若請求期間切換帳號，不顯示上一個帳號的結果。
    if (user.value?.id !== userId) return

    if (error) {
      if (error.code === '23505') {
        bookmarkMessage.value = '這個閱讀位置已經有書籤了。'
        return
      }

      throw error
    }

    bookmarkOpen.value = false
    bookmarkNote.value = ''
    bookmarkMessage.value = '書籤已儲存。'

    if (bookmarkMessageTimer !== null) {
      clearTimeout(bookmarkMessageTimer)
    }

    bookmarkMessageTimer = setTimeout(() => {
      // 避免清掉後續操作產生的錯誤提示。
      if (bookmarkMessage.value === '書籤已儲存。') {
        bookmarkMessage.value = ''
      }

      bookmarkMessageTimer = null
    }, 3000)
  } catch (error) {
    if (user.value?.id !== userId) return

    console.error('儲存閱讀書籤失敗:', error)
    bookmarkMessage.value = '儲存失敗，請稍後再試。'
  } finally {
    bookmarkSaving.value = false
  }
}

watch(
    [() => user.value?.id, canReadChapter],
    () => {
      bookmarkOpen.value = false
      bookmarkNote.value = ''
      bookmarkMessage.value = ''
    },
)

</script>

<template>
  <article
      v-if="chapter"
      class="reader-wrapper"
      :class="`mode-${readingMode}`"
  >
    <div class="reader">

      <!-- 閱讀設定 -->
      <div class="reader-toolbar">
        <div class="font-control">
          <button
              type="button"
              @click="decreaseFontSize"
          >
            A-
          </button>

          <span>
            {{ fontSize }}px
          </span>

          <button
              type="button"
              @click="increaseFontSize"
          >
            A+
          </button>
        </div>

        <div class="mode-control">
          <button
              type="button"
              :class="{
              active: readingMode === 'light'
            }"
              @click="readingMode = 'light'"
          >
            淺色
          </button>

          <button
              type="button"
              :class="{
              active: readingMode === 'sepia'
            }"
              @click="readingMode = 'sepia'"
          >
            護眼
          </button>

          <button
              type="button"
              :class="{
              active: readingMode === 'dark'
            }"
              @click="readingMode = 'dark'"
          >
            深色
          </button>
        </div>
      </div>

      <!-- 章節標題 -->
      <header class="reader-header">
        <NuxtLink
            v-if="book"
            :to="`/novels/${slug}`"
            class="book-link"
        >
          {{ book.title }}
        </NuxtLink>

        <p class="chapter-number">
          第 {{ chapter.chapter }} 章
        </p>

        <h1>
          {{ chapter.title }}
        </h1>
      </header>

      <!-- 免費章節正文：繼續使用 Nuxt Content -->
      <div
          v-if="!isPaidChapter"
          ref="novelContent"
          class="novel-content"
          :style="{
          fontSize: `${fontSize}px`
        }"
      >
        <ContentRenderer :value="chapter" />
      </div>

      <!-- 付費章節正文：只使用 Supabase 回傳的 body -->
      <div
          v-else-if="hasPaidAccess && paidChapterBody !== null"
          ref="novelContent"
          class="novel-content paid-chapter-content"
          :style="{
          fontSize: `${fontSize}px`
        }"
      >{{ paidChapterBody }}</div>

      <!-- 等待登入狀態、權限與付費正文查詢完成 -->
      <section
          v-else-if="accessLoading"
          class="paid-chapter-lock"
          aria-live="polite"
      >
        <h2>
          正在確認閱讀權限
        </h2>

        <p>
          請稍候…
        </p>
      </section>

      <!-- 有權限但正文無法取得 -->
      <section
          v-else-if="hasPaidAccess && paidContentError"
          class="paid-chapter-lock"
          aria-live="polite"
      >
        <h2>
          暫時無法載入本章
        </h2>

        <p>
          請重新整理頁面後再試一次
        </p>
      </section>

      <!-- 付費章節鎖定提示 -->
      <section
          v-else
          class="paid-chapter-lock"
          aria-labelledby="paid-chapter-title"
      >
        <h2 id="paid-chapter-title">
          本章為付費章節
        </h2>

        <p>
          {{
            user
                ? '你的帳號尚未擁有本章閱讀權限'
                : '請先登入，再解鎖本章完整內容'
          }}
        </p>

        <p class="chapter-price">
          本章售價 NT$ {{ chapter.price }}
        </p>

        <!-- 正在查詢是否有待付款訂單 -->
        <p
            v-if="pendingOrderLoading"
            class="pending-order-message"
        >
          正在確認待付款訂單…
        </p>

        <!-- 已有待付款訂單：不再顯示購買選項 -->
        <div
            v-else-if="createdOrderNo"
            class="pending-order-box"
        >
          <strong>
            你已有一筆待付款訂單
          </strong>

          <span>
    訂單編號：{{ createdOrderNo }}
  </span>

          <p>
            尚未完成付款前，不需要再次建立訂單。
          </p>

          <button
              v-if="paymentAvailable"
              type="button"
              class="unlock-button"
              :disabled="paymentSubmitting"
              :aria-busy="paymentSubmitting"
              @click="handlePayment"
          >
            {{
              paymentSubmitting
                  ? '正在前往付款…'
                  : '前往測試付款'
            }}
          </button>

          <NuxtLink
              to="/account"
              class="pending-order-link"
          >
            前往會員中心查看
          </NuxtLink>
        </div>

        <!-- 沒有待付款訂單：才顯示購買選項 -->
        <template v-else>
          <label
              v-if="user"
              class="purchase-consent"
          >
            <input
                v-model="purchaseConsent"
                type="checkbox"
            >

            <span>
      我已閱讀並同意

      <NuxtLink
          to="/terms"
          target="_blank"
          @click.stop
      >
        服務條款
      </NuxtLink>

      與

      <NuxtLink
          to="/refund"
          target="_blank"
          @click.stop
      >
        退款政策
      </NuxtLink>

      ，並同意付款完成後立即提供數位內容，
      知悉內容開始提供後不適用七日解除權。
    </span>
          </label>

          <button
              type="button"
              class="unlock-button"
              :disabled="
        !paymentAvailable ||
        orderCreating ||
        Boolean(user && !purchaseConsent)
      "
              @click="handlePurchase"
          >
            {{
              orderCreating
                  ? '建立訂單中…'
                  : paymentAvailable
                      ? (
                          user
                              ? `建立測試訂單 NT$ ${chapter.price}`
                              : '登入後購買'
                      )
                      : '付款功能準備中'
            }}
          </button>
        </template>

        <!-- 建立或查詢訂單失敗 -->
        <p
            v-if="purchaseError"
            class="purchase-error"
            role="alert"
        >
          {{ purchaseError }}
        </p>

      </section>

      <!-- 章節導覽 -->
      <nav class="chapter-navigation">
        <div class="navigation-left">
          <NuxtLink
              v-if="previousChapter"
              :to="previousChapter.path"
              class="navigation-button"
          >
            ← 上一章
          </NuxtLink>
        </div>

        <NuxtLink
            :to="`/novels/${slug}`"
            class="navigation-button directory-button"
        >
          章節目錄
        </NuxtLink>

        <div class="navigation-right">
          <NuxtLink
              v-if="nextChapter"
              :to="nextChapter.path"
              class="navigation-button"
          >
            下一章 →
          </NuxtLink>
        </div>
      </nav>

    </div>

    <!-- 閱讀書籤：只提供給已登入且可閱讀本章的使用者 -->
    <ClientOnly>
      <aside
          v-if="initialized && user && canReadChapter"
          class="bookmark-tools"
          aria-label="閱讀書籤"
      >
        <form
            v-if="bookmarkOpen"
            id="reading-bookmark-form"
            class="bookmark-panel"
            @submit.prevent="saveBookmark"
        >
          <strong>加入書籤：{{ bookmarkProgress }}%</strong>

          <label for="reading-bookmark-note">
            備註（選填）
          </label>

          <textarea
              id="reading-bookmark-note"
              v-model="bookmarkNote"
              maxlength="200"
              rows="3"
              placeholder="例如：下次想重看的段落"
              :disabled="bookmarkSaving"
          />

          <div class="bookmark-actions">
            <button
                type="button"
                :disabled="bookmarkSaving"
                @click="bookmarkOpen = false; bookmarkMessage = ''"
            >
              取消
            </button>

            <button
                type="submit"
                :disabled="bookmarkSaving"
            >
              {{ bookmarkSaving ? '儲存中…' : '儲存書籤' }}
            </button>
          </div>
        </form>

        <p
            v-if="bookmarkMessage"
            class="bookmark-message"
            role="status"
        >
          {{ bookmarkMessage }}
        </p>

        <button
            v-if="!bookmarkOpen"
            type="button"
            aria-controls="reading-bookmark-form"
            :aria-expanded="bookmarkOpen"
            :disabled="bookmarkSaving"
            @click="openBookmark"
        >
          ＋ 加入書籤
        </button>
      </aside>
    </ClientOnly>
  </article>
</template>

<style scoped>
.pending-order-message {
  margin: 20px 0 0;
}

.pending-order-box {
  max-width: 520px;
  margin: 0 auto;
  padding: 20px;

  border: 1px solid rgba(128, 128, 128, 0.35);
  border-radius: 10px;

  text-align: left;
}

.pending-order-box strong,
.pending-order-box span {
  display: block;
}

.pending-order-box span {
  margin-top: 8px;

  font-size: 13px;
  opacity: 0.7;
}

.paid-chapter-lock .pending-order-box p {
  margin: 12px 0;

  font-size: 14px;
}

.pending-order-link {
  display: inline-block;

  color: inherit;
  font-weight: 700;
}

.reader-wrapper {
  margin: -40px -20px 0;
  padding: 40px 20px 100px;

  min-height: calc(100vh - 80px);

  transition:
      background 0.2s ease,
      color 0.2s ease;
}

.reader {
  max-width: 760px;
  margin: 0 auto;
}

/* -------------------------
   閱讀模式
------------------------- */

.mode-light {
  background: #ffffff;
  color: #292929;
}

.mode-sepia {
  background: #f6f1e7;
  color: #3b342c;
}

.mode-dark {
  background: #1f1f1f;
  color: #d8d8d8;
}

/* -------------------------
   工具列
------------------------- */

.reader-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;

  gap: 20px;

  padding: 12px 0 24px;
}

.font-control,
.mode-control {
  display: flex;
  align-items: center;
  gap: 8px;
}

.reader-toolbar button {
  padding: 7px 12px;

  border: 1px solid #ccc;
  border-radius: 6px;

  background: transparent;
  color: inherit;

  cursor: pointer;
}

.reader-toolbar button:hover {
  background: rgba(128, 128, 128, 0.1);
}

.reader-toolbar button.active {
  font-weight: 700;
  border-color: currentColor;
}

.font-control span {
  min-width: 44px;

  text-align: center;
  font-size: 14px;
}

/* -------------------------
   章節標題
------------------------- */

.reader-header {
  padding: 36px 0 48px;

  text-align: center;

  border-bottom:
      1px solid rgba(128, 128, 128, 0.25);
}

.book-link {
  font-size: 14px;

  color: inherit;
  opacity: 0.65;

  text-decoration: none;
}

.book-link:hover {
  opacity: 1;
}

.chapter-number {
  margin: 24px 0 8px;

  font-size: 14px;

  opacity: 0.6;
}

.reader-header h1 {
  margin: 0;

  font-size: 36px;
  line-height: 1.4;
}

/* -------------------------
   小說正文
------------------------- */

.novel-content {
  padding: 56px 0;

  line-height: 2.1;
}

.paid-chapter-content {
  white-space: pre-wrap;
}

.novel-content :deep(h1) {
  display: none;
}

.novel-content :deep(h2) {
  margin: 3em 0 1.2em;

  font-size: 1.35em;
  line-height: 1.5;

  color: inherit;
}

.novel-content :deep(h2 a) {
  color: inherit;
  text-decoration: none;
}

.novel-content :deep(h3) {
  margin: 2.5em 0 1em;

  font-size: 1.15em;

  color: inherit;
}

.novel-content :deep(h3 a) {
  color: inherit;
  text-decoration: none;
}

.novel-content :deep(p) {
  margin: 0 0 1.8em;
}

.novel-content :deep(blockquote) {
  margin: 2em 0;

  padding: 4px 0 4px 20px;

  border-left: 3px solid currentColor;

  opacity: 0.7;
}

.novel-content :deep(hr) {
  margin: 3em 0;

  border: 0;

  border-top:
      1px solid rgba(128, 128, 128, 0.3);
}

/* -------------------------
   付費章節鎖定
------------------------- */

.paid-chapter-lock {
  margin: 56px 0;
  padding: 56px 24px;

  text-align: center;

  border:
      1px solid rgba(128, 128, 128, 0.3);
  border-radius: 12px;
}

.paid-chapter-lock h2 {
  margin: 0 0 12px;

  font-size: 24px;
}

.paid-chapter-lock p {
  margin: 0 0 28px;

  opacity: 0.7;
}

.chapter-price {
  font-size: 22px;
  font-weight: 700;
  color: inherit;
  opacity: 1;
}

.paid-chapter-lock .delivery-note {
  max-width: 600px;
  margin: 0 auto 28px;

  font-size: 14px;
  line-height: 1.8;
  text-align: center;
  text-wrap: balance;

  opacity: 0.8;
}

.purchase-consent {
  display: flex;
  align-items: flex-start;
  gap: 10px;

  max-width: 600px;
  margin: 0 auto 24px;

  text-align: left;
  font-size: 13px;
  line-height: 1.7;

  cursor: pointer;
}

.purchase-consent input {
  flex-shrink: 0;

  width: 16px;
  height: 16px;
  margin-top: 3px;
}

.purchase-consent span {
  opacity: 0.8;
}

.purchase-consent a {
  color: inherit;
  font-weight: 700;
}

.purchase-consent a:hover {
  text-decoration: none;
}

.unlock-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.unlock-button {
  padding: 11px 22px;

  border: 1px solid currentColor;
  border-radius: 8px;

  background: transparent;
  color: inherit;

  font: inherit;
  font-weight: 700;

  cursor: pointer;
}

.unlock-button:hover {
  background: rgba(128, 128, 128, 0.1);
}

.purchase-success,
.purchase-error {
  margin: 20px 0 0;

  font-size: 14px;
}

.paid-chapter-lock .purchase-success {
  color: #277443;
  opacity: 1;
}

.paid-chapter-lock .purchase-error {
  color: #b91c1c;
  opacity: 1;
}

.purchase-success a {
  margin-left: 8px;

  color: inherit;
  font-weight: 700;
}
/* -------------------------
   章節導覽
------------------------- */

.chapter-navigation {
  display: grid;

  grid-template-columns:
    1fr auto 1fr;

  align-items: center;

  gap: 16px;

  padding-top: 32px;

  border-top:
      1px solid rgba(128, 128, 128, 0.25);
}

.navigation-left {
  display: flex;

  justify-content: flex-start;
}

.navigation-right {
  display: flex;

  justify-content: flex-end;
}

.navigation-button {
  display: inline-block;

  padding: 10px 16px;

  border:
      1px solid rgba(128, 128, 128, 0.4);

  border-radius: 8px;

  color: inherit;

  text-decoration: none;
}

.navigation-button:hover {
  background:
      rgba(128, 128, 128, 0.1);
}

.directory-button {
  text-align: center;
}

/* -------------------------
   手機
------------------------- */

.bookmark-tools {
  position: fixed;
  right: 16px;
  bottom: calc(16px + env(safe-area-inset-bottom, 0px));
  z-index: 40;
  width: min(320px, calc(100vw - 32px));
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
}

.bookmark-panel,
.bookmark-message,
.bookmark-tools button {
  box-sizing: border-box;
  background: #fff;
  color: #292929;
  border: 1px solid #bbb;
  border-radius: 8px;
}

.bookmark-panel {
  width: 100%;
  padding: 16px;
  max-height: 65dvh;
  overflow-y: auto;

  /*
   * 直向 flex：高度不夠時由輸入框縮小，
   * 「取消／儲存」固定留在面板底部看得到的位置。
   */
  display: flex;
  flex-direction: column;

  /* 面板捲到底時不要接著捲動底下的正文。 */
  overscroll-behavior: contain;

  box-shadow: 0 4px 20px rgb(0 0 0 / 15%);
}

.bookmark-panel label {
  display: block;
  margin: 14px 0 6px;
}

.bookmark-panel textarea {
  box-sizing: border-box;
  width: 100%;

  /* 可以被壓縮，但至少保留一行可輸入的高度。 */
  flex: 1 1 auto;
  min-height: 44px;
  padding: 8px;
  font: inherit;
  font-size: 16px;
  background: transparent;
  color: inherit;
  border: 1px solid #999;
  border-radius: 6px;
  resize: vertical;
}

.bookmark-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;

  /* 按鈕列不參與壓縮，永遠完整顯示。 */
  flex: none;
}

.bookmark-tools button {
  padding: 10px 14px;
  font: inherit;
  cursor: pointer;
}

.bookmark-tools button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.bookmark-message {
  margin: 0;
  padding: 10px 14px;
  overflow-wrap: anywhere;
}

.mode-sepia .bookmark-panel,
.mode-sepia .bookmark-message,
.mode-sepia .bookmark-tools button {
  background: #f6f1e7;
  color: #3b342c;
}

.mode-dark .bookmark-panel,
.mode-dark .bookmark-message,
.mode-dark .bookmark-tools button {
  background: #292929;
  color: #d8d8d8;
  border-color: #666;
}

@media (max-width: 768px) {
  .paid-chapter-lock .delivery-note {
    max-width: 100%;
    text-align: left;
  }

  .reader-wrapper {
    margin-top: -24px;

    padding-top: 24px;

    /*
     * 底部留出浮動書籤按鈕的高度，
     * 讓正文最後一行能捲到按鈕上方。
     */
    padding-bottom: calc(
        104px + env(safe-area-inset-bottom, 0px)
    );
  }

  /*
   * 兩組控制各佔一整列、按鈕平分寬度。
   * 直向排列會吃掉太多首屏高度，
   * 擠成一列又會讓按鈕小到不好按。
   */
  .reader-toolbar {
    align-items: stretch;

    flex-wrap: wrap;
    gap: 10px;

    padding: 8px 0 20px;
  }

  .font-control,
  .mode-control {
    flex: 1 1 100%;
  }

  .reader-toolbar button {
    flex: 1 1 0;

    min-height: 44px;
  }

  .reader-header {
    padding: 24px 0 36px;
  }

  .reader-header h1 {
    font-size: 30px;
  }

  .novel-content {
    padding: 40px 0;

    line-height: 2;
  }

  .chapter-navigation {
    grid-template-columns:
      1fr 1fr;
  }

  .directory-button {
    grid-column: 1 / -1;
    grid-row: 1;

    width: 100%;

    box-sizing: border-box;
  }

  .navigation-left {
    grid-column: 1;
    grid-row: 2;
  }

  .navigation-right {
    grid-column: 2;
    grid-row: 2;
  }

  /* 上下章各自填滿半格，避免變成兩顆難點的小按鈕。 */
  .navigation-button {
    display: flex;
    align-items: center;
    justify-content: center;

    width: 100%;
    min-height: 44px;

    box-sizing: border-box;
  }

  /*
   * 浮動書籤改為貼齊左右邊界。
   * 展開後像底部面板，收合時只有右下角一顆按鈕。
   */
  .bookmark-tools {
    left: 12px;
    right: 12px;

    width: auto;

    align-items: stretch;
  }

  .bookmark-tools > button {
    align-self: flex-end;

    min-height: 44px;
  }

  .bookmark-message {
    align-self: flex-end;

    max-width: 100%;
  }

  /*
   * 鍵盤升起時視窗高度會縮小，
   * dvh 會跟著變，面板仍留在可視範圍內。
   */
  .bookmark-panel {
    max-height: 55dvh;
  }
}
</style>
