<script setup lang="ts">
// 同一頁換不同的 query 時重新建立元件，避免沿用上一次的帶入資訊。
definePageMeta({
  key: route => route.fullPath,
})

const route = useRoute()

const {
  user,
  initialized,
} = useAuth()

const supabase = useSupabase()

useHead({
  title: '問題回報｜MYBB',
  meta: [
    { name: 'robots', content: 'noindex, nofollow' },
  ],
})

type Category = 'content' | 'reading' | 'paid_unreadable' | 'other'

const CATEGORY_OPTIONS: {
  value: Category
  label: string
}[] = [
  { value: 'content', label: '章節錯字、內容缺漏' },
  { value: 'reading', label: '閱讀進度或書籤異常' },
  { value: 'paid_unreadable', label: '已付款但無法閱讀' },
  { value: 'other', label: '其他問題' },
]

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const ORDER_NO_PATTERN = /^[A-Za-z0-9]{1,30}$/

function queryString(name: string) {
  const value = route.query[name]

  return typeof value === 'string' ? value : ''
}

/*
 * 從章節或訂單進入時帶入的資訊。
 *
 * 這裡只檢查格式。章節與訂單會再各自確認，
 * 確認通過才顯示和送出；Server 送出時也會再驗證一次。
 */
const context = (() => {
  const orderNo = queryString('order')

  if (ORDER_NO_PATTERN.test(orderNo)) {
    return { type: 'order' as const, orderNo }
  }

  const bookSlug = queryString('book')
  const chapterSlug = queryString('chapter')

  if (
      SLUG_PATTERN.test(bookSlug) &&
      SLUG_PATTERN.test(chapterSlug)
  ) {
    return { type: 'chapter' as const, bookSlug, chapterSlug }
  }

  return null
})()

// 顯示用的章節名稱；找不到章節就不附帶章節資訊。
const { data: chapterLabel } = await useAsyncData(
    `support-context-${route.fullPath}`,
    async () => {
      if (context?.type !== 'chapter') {
        return null
      }

      const [book, chapter] = await Promise.all([
        queryCollection('novelBooks')
            .where('stem', '=', `novels/${context.bookSlug}/index`)
            .first(),
        queryCollection('novelChapters')
            .where(
                'stem',
                '=',
                `novels/${context.bookSlug}/${context.chapterSlug}`,
            )
            .first(),
      ])

      if (!chapter) {
        return null
      }

      return `${book?.title ?? context.bookSlug}／第 ${chapter.chapter} 章 ${chapter.title}`
    },
)

const sendChapterContext = computed(() =>
    context?.type === 'chapter' && Boolean(chapterLabel.value),
)

/*
 * 訂單要確認是本人的才顯示。
 *
 * 用會員自己的登入狀態查詢，RLS 只會回傳自己的訂單；
 * 查不到就代表不存在或不是本人的，不顯示也不送出。
 */
type OrderContextState =
    | { status: 'none' }
    | { status: 'checking' }
    | { status: 'found', orderNo: string, label: string }
    | { status: 'missing' }
    | { status: 'error' }

const orderContext = ref<OrderContextState>({
  status: context?.type === 'order' ? 'checking' : 'none',
})

let orderCheckId = 0

async function verifyOrderContext() {
  if (context?.type !== 'order') {
    return
  }

  const requestId = ++orderCheckId
  const userId = user.value?.id

  orderContext.value = { status: 'checking' }

  // 登入狀態還沒準備好時先維持「確認中」，準備好後會再跑一次。
  if (!import.meta.client || !initialized.value || !userId) {
    return
  }

  const isCurrent = () =>
      requestId === orderCheckId &&
      user.value?.id === userId

  try {
    const {
      data: order,
      error,
    } = await supabase
        .from('orders')
        .select('order_no, book_slug, chapter_slug')
        .eq('order_no', context.orderNo)
        .maybeSingle()

    if (!isCurrent()) return

    if (error) {
      orderContext.value = { status: 'error' }
      return
    }

    if (!order) {
      orderContext.value = { status: 'missing' }
      return
    }

    const [book, chapter] = await Promise.all([
      queryCollection('novelBooks')
          .where('stem', '=', `novels/${order.book_slug}/index`)
          .first(),
      queryCollection('novelChapters')
          .where(
              'stem',
              '=',
              `novels/${order.book_slug}/${order.chapter_slug}`,
          )
          .first(),
    ])

    if (!isCurrent()) return

    orderContext.value = {
      status: 'found',
      orderNo: order.order_no,
      label: chapter
          ? `${book?.title ?? order.book_slug}／第 ${chapter.chapter} 章 ${chapter.title}`
          : `${order.book_slug}／${order.chapter_slug}`,
    }
  } catch {
    if (!isCurrent()) return

    orderContext.value = { status: 'error' }
  }
}

// 登入完成或換帳號時重新確認。
watch(
    [initialized, () => user.value?.id],
    () => {
      void verifyOrderContext()
    },
    { immediate: true },
)

const initialCategory = queryString('category')

const category = ref<Category | ''>(
    CATEGORY_OPTIONS.some(option => option.value === initialCategory)
        ? initialCategory as Category
        : '',
)

const description = ref('')
const contactEmail = ref('')
const submitting = ref(false)
const errorMessage = ref('')
const copyMessage = ref('')

const result = ref<{
  reportNo: string
  duplicate: boolean
} | null>(null)

// 以字元計算，跟 Server 與資料庫一致。
const descriptionLength = computed(() =>
    Array.from(description.value.trim()).length,
)

// 聯絡信箱預設帶入帳號信箱，使用者可以修改。
watch(
    () => user.value?.email,
    (email) => {
      if (email && !contactEmail.value) {
        contactEmail.value = email
      }
    },
    { immediate: true },
)

// 換帳號時清掉上一個人的表單與結果。
watch(
    () => user.value?.id,
    (id, previousId) => {
      if (previousId && id !== previousId) {
        description.value = ''
        contactEmail.value = user.value?.email ?? ''
        result.value = null
        errorMessage.value = ''
        copyMessage.value = ''
      }
    },
)

async function submitReport() {
  if (submitting.value) {
    return
  }

  errorMessage.value = ''

  // 訂單還在確認中，等確認完再送出，避免漏帶訂單資訊。
  if (orderContext.value.status === 'checking') {
    return
  }

  if (!category.value) {
    errorMessage.value = '請選擇問題類型。'
    return
  }

  if (descriptionLength.value < 10) {
    errorMessage.value = '請至少用 10 個字描述問題。'
    return
  }

  const userId = user.value?.id

  if (!userId) {
    return
  }

  submitting.value = true

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

    const response = await $fetch<{
      reportNo: string
      duplicate: boolean
    }>('/api/support/reports', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      body: {
        category: category.value,
        description: description.value,
        contactEmail: contactEmail.value,
        // 只送出已確認屬於本人的訂單。
        orderNo:
            orderContext.value.status === 'found'
                ? orderContext.value.orderNo
                : undefined,
        bookSlug:
            sendChapterContext.value && context?.type === 'chapter'
                ? context.bookSlug
                : undefined,
        chapterSlug:
            sendChapterContext.value && context?.type === 'chapter'
                ? context.chapterSlug
                : undefined,
      },
      retry: 0,
    })

    // 送出期間切換帳號，就不顯示上一個帳號的結果。
    if (user.value?.id !== userId) return

    result.value = response
    description.value = ''
  } catch (error: unknown) {
    if (user.value?.id !== userId) return

    const message = (
        error as {
          data?: {
            data?: {
              message?: unknown
            }
          }
        } | null
    )?.data?.data?.message

    errorMessage.value =
        typeof message === 'string'
            ? message
            : '目前無法送出回報，請稍後再試。'
  } finally {
    submitting.value = false
  }
}

async function copyReportNo() {
  if (!result.value) {
    return
  }

  try {
    await navigator.clipboard.writeText(result.value.reportNo)
    copyMessage.value = '已複製回報編號。'
  } catch {
    copyMessage.value = '無法自動複製，請手動選取編號。'
  }
}
</script>

<template>
  <section class="support-page">
    <h1>問題回報</h1>

    <p v-if="!initialized">
      讀取會員資料中…
    </p>

    <!-- 未登入 -->
    <template v-else-if="!user">
      <p>
        為了確認訂單與閱讀權限，回報問題需要先登入。
      </p>

      <NuxtLink
          :to="{ path: '/login', query: { redirect: route.fullPath } }"
          class="support-primary"
      >
        登入後回報
      </NuxtLink>

      <p class="support-hint">
        無法登入？請寄信到
        <a href="mailto:yehweiyang@gmail.com">yehweiyang@gmail.com</a>
      </p>
    </template>

    <!-- 送出成功 -->
    <div
        v-else-if="result"
        class="support-result"
        role="status"
    >
      <p>
        {{
          result.duplicate
              ? '你剛才已經送出相同的回報，不會重複建立。'
              : '已收到你的回報。'
        }}
      </p>

      <p class="support-report-no">
        回報編號：
        <strong>{{ result.reportNo }}</strong>

        <button
            type="button"
            class="support-secondary"
            @click="copyReportNo"
        >
          複製
        </button>
      </p>

      <p
          v-if="copyMessage"
          class="support-hint"
      >
        {{ copyMessage }}
      </p>

      <p class="support-hint">
        我們會寄信到 {{ contactEmail }} 回覆，聯絡時請附上回報編號。
      </p>

      <div class="support-actions">
        <NuxtLink to="/account">
          回會員中心
        </NuxtLink>

        <button
            type="button"
            class="support-secondary"
            @click="result = null; copyMessage = ''"
        >
          再回報一個問題
        </button>
      </div>
    </div>

    <!-- 回報表單 -->
    <form
        v-else
        @submit.prevent="submitReport"
    >
      <p
          v-if="orderContext.status === 'checking'"
          class="support-hint"
          role="status"
      >
        正在確認訂單…
      </p>

      <p
          v-else-if="orderContext.status === 'found'"
          class="support-context"
      >
        相關訂單：<strong>{{ orderContext.orderNo }}</strong>
        <br>
        {{ orderContext.label }}
      </p>

      <p
          v-else-if="orderContext.status === 'missing'"
          class="support-hint"
          role="status"
      >
        你的帳號裡沒有這筆訂單，這次回報不會附帶訂單資訊。
      </p>

      <p
          v-else-if="orderContext.status === 'error'"
          class="support-hint"
          role="status"
      >
        目前無法確認訂單，這次回報不會附帶訂單資訊。
      </p>

      <p
          v-else-if="sendChapterContext"
          class="support-context"
      >
        相關章節：<strong>{{ chapterLabel }}</strong>
      </p>

      <fieldset>
        <legend>問題類型</legend>

        <label
            v-for="option in CATEGORY_OPTIONS"
            :key="option.value"
            class="support-option"
        >
          <input
              v-model="category"
              type="radio"
              name="category"
              :value="option.value"
              :disabled="submitting"
              required
          >
          {{ option.label }}
        </label>
      </fieldset>

      <label for="support-description">
        問題描述
      </label>

      <textarea
          id="support-description"
          v-model="description"
          rows="6"
          minlength="10"
          maxlength="2000"
          required
          :disabled="submitting"
          placeholder="請描述發生了什麼、在哪一段，以及你預期看到的結果。"
      />

      <p class="support-hint">
        {{ descriptionLength }} / 2000　請勿填寫密碼或信用卡資料。
      </p>

      <label for="support-email">
        聯絡信箱
      </label>

      <input
          id="support-email"
          v-model="contactEmail"
          type="email"
          autocomplete="email"
          maxlength="254"
          required
          :disabled="submitting"
      >

      <p class="support-hint">
        送出時會一併記錄你的瀏覽器版本，協助排查閱讀問題。
      </p>

      <p
          v-if="errorMessage"
          class="support-error"
          role="alert"
      >
        {{ errorMessage }}
      </p>

      <button
          type="submit"
          class="support-primary"
          :disabled="submitting || orderContext.status === 'checking'"
      >
        {{ submitting ? '送出中…' : '送出回報' }}
      </button>
    </form>
  </section>
</template>

<style scoped>
.support-page {
  max-width: 560px;
  margin: 0 auto;
}

.support-page form {
  display: grid;
  gap: 10px;
}

fieldset {
  display: grid;
  gap: 2px;

  margin: 0 0 8px;
  padding: 12px 16px;

  border: 1px solid #ddd;
  border-radius: 10px;
}

legend {
  padding: 0 6px;
  font-weight: 600;
}

.support-option {
  display: flex;
  align-items: center;
  gap: 10px;

  min-height: 44px;

  cursor: pointer;
}

textarea,
input[type="email"] {
  box-sizing: border-box;
  width: 100%;

  padding: 10px 12px;

  border: 1px solid #bbb;
  border-radius: 6px;

  font: inherit;
  font-size: 16px;
}

textarea {
  resize: vertical;
}

.support-context {
  margin: 0 0 8px;
  padding: 10px 14px;

  border-radius: 8px;
  background: #f3f6fa;

  overflow-wrap: anywhere;
}

.support-hint {
  margin: 0;

  font-size: 13px;
  color: #666;

  overflow-wrap: anywhere;
}

.support-error {
  margin: 0;
  color: #a4262c;
}

.support-primary {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  min-height: 44px;
  padding: 6px 16px;

  border: 1px solid #0d6efd;
  border-radius: 6px;
  background: #0d6efd;
  color: #fff;

  font: inherit;
  text-decoration: none;

  cursor: pointer;
}

.support-primary:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.support-secondary {
  min-height: 38px;
  padding: 4px 12px;

  border: 1px solid #ccc;
  border-radius: 6px;
  background: transparent;
  color: inherit;

  font: inherit;

  cursor: pointer;
}

.support-result {
  padding: 20px;

  border: 1px solid #ddd;
  border-radius: 10px;
}

.support-report-no {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;

  font-size: 18px;

  overflow-wrap: anywhere;
}

.support-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;

  margin-top: 16px;
}
</style>