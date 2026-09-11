<script setup lang="ts">
const props = defineProps<{
  articleSlug: string
}>()

type Comment = {
  id: string
  nickname: string
  content: string
  created_at: string
  ip_label: string
}

type Turnstile = {
  render: (
      element: HTMLElement,
      options: Record<string, unknown>,
  ) => string
  reset: (id: string) => void
  remove: (id: string) => void
}

const config = useRuntimeConfig()

const { user } = useAuth()
const supabase = useSupabase()

// 只控制按鈕顯示；實際權限仍由伺服器再次確認。
const canViewFullIP = computed(
    () => user.value?.app_metadata?.support_admin === true,
)

const fullIPs = ref<Record<string, string>>({})
const ipLoading = ref<Record<string, boolean>>({})
const ipErrors = ref<Record<string, string>>({})

let ipRequestVersion = 0

function clearPrivateIPs() {
  ipRequestVersion++
  fullIPs.value = {}
  ipLoading.value = {}
  ipErrors.value = {}
}

// 登出、換帳號或管理資格改變時，清除已顯示的完整 IP。
watch(
    [
      () => user.value?.id,
      () => user.value?.app_metadata?.support_admin,
    ],
    clearPrivateIPs,
    { flush: 'sync' },
)

async function showFullIP(commentId: string) {
  if (!canViewFullIP.value || ipLoading.value[commentId]) return

  // 已展開時，再按一次就收起。
  if (fullIPs.value[commentId]) {
    delete fullIPs.value[commentId]
    return
  }

  const requestVersion = ipRequestVersion
  const userId = user.value?.id

  const isCurrent = () =>
      !disposed
      && requestVersion === ipRequestVersion
      && user.value?.id === userId
      && canViewFullIP.value

  ipLoading.value[commentId] = true
  delete ipErrors.value[commentId]

  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession()

    if (!isCurrent()) return

    if (error || !session) {
      throw new Error('session_expired')
    }

    const result = await $fetch<{ ip: string }>(
        `/api/tech/${encodeURIComponent(props.articleSlug)}/comments/${encodeURIComponent(commentId)}/ip`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          retry: 0,
        },
    )

    if (!isCurrent()) return

    fullIPs.value[commentId] = result.ip
  } catch (error) {
    if (!isCurrent()) return

    const statusCode = (
        error as { statusCode?: number }
    )?.statusCode

    ipErrors.value[commentId] =
        statusCode === 403
            ? '你目前沒有管理權限。'
            : errorMessage(
                error,
                '無法讀取完整 IP，請確認登入狀態後再試。',
            )
  } finally {
    if (isCurrent()) {
      delete ipLoading.value[commentId]
    }
  }
}

const comments = ref<Comment[]>([])
const page = ref(1)
const hasMore = ref(false)
const loading = ref(false)
const listError = ref('')

const nickname = ref('')
const content = ref('')
const website = ref('')
const token = ref('')
const submitting = ref(false)
const submitError = ref('')
const successMessage = ref('')

const captchaElement = ref<HTMLElement | null>(null)
const captchaLoading = ref(false)
const awaitingVerification = ref(false)
const captchaError = ref('')

let widgetId: string | undefined
let disposed = false
let listRequestId = 0

const contentLength = computed(
    () => Array.from(content.value.trim()).length,
)

function turnstile() {
  return (
      window as Window & { turnstile?: Turnstile }
  ).turnstile
}

function errorMessage(error: unknown, fallback: string) {
  const message = (
      error as {
        data?: {
          data?: {
            message?: unknown
          }
        }
      }
  )?.data?.data?.message

  return typeof message === 'string' ? message : fallback
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
  })
}

async function loadComments() {
  clearPrivateIPs()

  const requestId = ++listRequestId

  loading.value = true
  listError.value = ''
  comments.value = []

  try {
    const result = await $fetch<{
      comments: Comment[]
      hasMore: boolean
    }>(
        `/api/tech/${encodeURIComponent(props.articleSlug)}/comments`,
        {
          query: { page: page.value },
          retry: 0,
        },
    )

    if (disposed || requestId !== listRequestId) return

    comments.value = result.comments
    hasMore.value = result.hasMore
  } catch (error) {
    if (disposed || requestId !== listRequestId) return

    listError.value = errorMessage(
        error,
        '目前無法讀取留言，請稍後再試。',
    )
  } finally {
    if (!disposed && requestId === listRequestId) {
      loading.value = false
    }
  }
}

function changePage(nextPage: number) {
  page.value = nextPage
  void loadComments()
}

async function prepareCaptcha() {
  if (captchaLoading.value || disposed) return

  token.value = ''
  captchaError.value = ''

  if (!config.public.turnstileSiteKey) {
    awaitingVerification.value = false
    captchaError.value = '留言驗證尚未設定完成。'
    return
  }

  captchaLoading.value = true

  try {
    // 等待畫面顯示驗證容器。
    await nextTick()

    const scriptId = 'tech-comments-turnstile'

    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script')

      script.id = scriptId
      script.src =
          'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      script.async = true
      script.defer = true

      document.head.appendChild(script)
    }

    const deadline = Date.now() + 15000

    while (!turnstile()) {
      if (disposed) return

      if (Date.now() > deadline) {
        document.getElementById(scriptId)?.remove()
        throw new Error('captcha_timeout')
      }

      await new Promise(resolve => setTimeout(resolve, 100))
    }

    if (disposed) return

    if (!captchaElement.value) {
      throw new Error('captcha_container_missing')
    }

    const api = turnstile()!

    if (widgetId !== undefined) {
      api.remove(widgetId)
      widgetId = undefined
    }

    const failVerification = (message: string) => {
      if (disposed || !awaitingVerification.value) return

      token.value = ''
      awaitingVerification.value = false
      captchaError.value = message
    }

    widgetId = api.render(captchaElement.value, {
      sitekey: config.public.turnstileSiteKey,
      action: 'tech_comment',
      theme: 'auto',
      size: 'flexible',
      retry: 'never',
      'refresh-expired': 'manual',
      'refresh-timeout': 'manual',

      callback: (value: string) => {
        if (disposed || !awaitingVerification.value) return

        token.value = value
        captchaError.value = ''
        awaitingVerification.value = false

        // 驗證成功後，自動完成剛才的留言送出。
        void submitComment()
      },

      'expired-callback': () => {
        failVerification('驗證已過期，請重新送出留言。')
      },

      'timeout-callback': () => {
        failVerification('驗證逾時，請重新送出留言。')
      },

      'error-callback': () => {
        failVerification('驗證未完成，請檢查網路後重試。')
      },
    })
  } catch {
    if (!disposed) {
      awaitingVerification.value = false
      captchaError.value = '驗證載入失敗，請重新送出留言。'
    }
  } finally {
    if (!disposed) captchaLoading.value = false
  }
}

async function submitComment() {

  if (submitting.value || awaitingVerification.value || disposed) return

  submitError.value = ''
  successMessage.value = ''

  if (!nickname.value.trim()) {
    submitError.value = '請填寫暱稱。'
    return
  }

  if (contentLength.value < 2 || contentLength.value > 1000) {
    submitError.value = '留言需要 2 到 1000 個字。'
    return
  }

  if (!token.value) {
    awaitingVerification.value = true
    await prepareCaptcha()
    return
  }

  submitting.value = true

  try {
    const result = await $fetch<{ duplicate: boolean }>(
        `/api/tech/${encodeURIComponent(props.articleSlug)}/comments`,
        {
          method: 'POST',
          retry: 0,
          body: {
            nickname: nickname.value,
            content: content.value,
            website: website.value,
            token: token.value,
          },
        },
    )

    if (disposed) return

    content.value = ''
    page.value = 1

    successMessage.value = result.duplicate
        ? '這則留言已經送出，不會重複新增。'
        : '留言已送出，謝謝你的分享。'

    await loadComments()
  } catch (error) {
    if (disposed) return

    submitError.value = errorMessage(
        error,
        '目前無法確認留言是否送出，請先重新載入留言查看。',
    )
  } finally {
    if (!disposed) {
      submitting.value = false
      token.value = ''

      // 送出結束後移除驗證元件。
      // 等下次按「送出留言」才建立新的驗證。
      awaitingVerification.value = false

      if (widgetId !== undefined) {
        turnstile()?.remove(widgetId)
        widgetId = undefined
      }
    }
  }
}

onMounted(() => {
  void loadComments()
})

onBeforeUnmount(() => {
  disposed = true
  listRequestId++
  clearPrivateIPs()

  if (widgetId !== undefined) {
    turnstile()?.remove(widgetId)
  }
})
</script>

<template>
  <section class="comments-section" aria-labelledby="comments-title">
    <div class="comments-heading">
      <h2 id="comments-title">文章留言</h2>

      <button
          type="button"
          :disabled="loading"
          @click="loadComments"
      >
        重新載入
      </button>
    </div>

    <p class="hint">
      不需登入即可留言。暱稱與留言會公開顯示，請勿填寫個人敏感資料。
      暱稱由訪客自行填寫，未經身分驗證。
    </p>

    <form class="comment-form" @submit.prevent="submitComment">
      <label for="comment-nickname">暱稱</label>

      <input
          id="comment-nickname"
          v-model="nickname"
          type="text"
          maxlength="30"
          autocomplete="nickname"
          required
          :disabled="submitting || awaitingVerification || captchaLoading"
          placeholder="怎麼稱呼你？"
      >

      <label for="comment-content">留言內容</label>

      <textarea
          id="comment-content"
          v-model="content"
          rows="5"
          minlength="2"
          maxlength="1000"
          required
          :disabled="submitting"
          placeholder="分享你的想法，或提出與文章相關的問題。"
      />

      <p class="hint">{{ contentLength }} / 1000</p>

      <div class="honeypot" aria-hidden="true">
        <label for="comment-website">請留空</label>
        <input
            id="comment-website"
            v-model="website"
            type="text"
            tabindex="-1"
            autocomplete="off"
        >
      </div>

      <div
          v-show="awaitingVerification"
          ref="captchaElement"
          class="captcha"
      />

      <p
          v-if="awaitingVerification"
          class="hint"
          role="status"
      >
        {{
          captchaLoading
              ? '正在載入驗證…'
              : '請完成驗證，通過後會自動送出留言。'
        }}
      </p>

      <div v-if="captchaError" class="captcha-error">
        <p role="alert">{{ captchaError }}</p>

        <button
            type="button"
            :disabled="captchaLoading || awaitingVerification || submitting"
            @click="submitComment"
        >
          重新驗證並送出
        </button>
      </div>

      <p v-if="submitError" class="error" role="alert">
        {{ submitError }}
      </p>

      <p v-if="successMessage" class="success" role="status">
        {{ successMessage }}
      </p>

      <button
          type="submit"
          class="submit-button"
          :disabled="submitting || awaitingVerification || captchaLoading"
      >
        {{
          submitting
              ? '送出中…'
              : awaitingVerification
                  ? '驗證中…'
                  : '送出留言'
        }}
      </button>

      <p class="hint">
        留言會公開顯示遮罩 IP。
        完整 IP 僅供管理人員處理濫用留言，IP 雜湊用於限制發送頻率。
        本站使用 Cloudflare Turnstile 驗證。
      </p>
    </form>

    <div class="comments-list" aria-live="polite">
      <p v-if="loading">讀取留言中…</p>

      <p v-else-if="listError" class="error" role="alert">
        {{ listError }}
      </p>

      <template v-else>
        <p v-if="!comments.length" class="hint">
          {{ page === 1 ? '還沒有留言，歡迎分享你的想法。' : '這一頁沒有留言。' }}
        </p>

        <article
            v-for="comment in comments"
            :key="comment.id"
            class="comment-card"
        >
          <div class="comment-meta">
            <strong>{{ comment.nickname }}</strong>
            <span class="guest-label">訪客</span>

            <time :datetime="comment.created_at">
              {{ formatDate(comment.created_at) }}
            </time>
          </div>

          <div class="comment-ip">
            <span>IP：{{ comment.ip_label || '未記錄' }}</span>

            <button
                v-if="canViewFullIP"
                type="button"
                class="ip-toggle"
                :disabled="ipLoading[comment.id]"
                :aria-expanded="Boolean(fullIPs[comment.id])"
                @click="showFullIP(comment.id)"
            >
              {{
                ipLoading[comment.id]
                    ? '讀取中…'
                    : fullIPs[comment.id]
                        ? '收起完整 IP'
                        : '查看完整 IP'
              }}
            </button>
          </div>

          <p
              v-if="canViewFullIP && fullIPs[comment.id]"
              class="private-ip"
          >
            管理者檢視：{{ fullIPs[comment.id] }}
          </p>

          <p
              v-if="canViewFullIP && ipErrors[comment.id]"
              class="error"
              role="alert"
          >
            {{ ipErrors[comment.id] }}
          </p>
          <p class="comment-content">{{ comment.content }}</p>
        </article>
      </template>
    </div>

    <nav
        v-if="page > 1 || hasMore"
        class="pagination"
        aria-label="留言分頁"
    >
      <button
          type="button"
          :disabled="loading || page <= 1"
          @click="changePage(page - 1)"
      >
        上一頁
      </button>

      <span>第 {{ page }} 頁</span>

      <button
          type="button"
          :disabled="loading || !hasMore"
          @click="changePage(page + 1)"
      >
        下一頁
      </button>
    </nav>
  </section>
</template>

<style scoped>
.comments-section {
  max-width: 780px;
  margin: 40px 0;
  padding-top: 32px;
  border-top: 1px solid #e5e5e5;
  overflow-wrap: anywhere;
}

.comments-heading,
.comment-meta,
.pagination {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.comments-heading {
  justify-content: space-between;
}

.comments-heading h2 {
  margin: 0;
  font-size: 24px;
}

.comment-form {
  display: grid;
  gap: 12px;
  position: relative;
  margin: 24px 0 32px;
}

input,
textarea,
button {
  box-sizing: border-box;
  font: inherit;
  font-size: 16px;
  border: 1px solid #ccc;
  border-radius: 6px;
}

input,
textarea {
  width: 100%;
  padding: 10px 12px;
  background: #fff;
  color: #222;
}

textarea {
  resize: vertical;
}

button {
  min-height: 44px;
  padding: 8px 16px;
  background: #fff;
  color: #333;
  cursor: pointer;
}

button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.submit-button {
  justify-self: start;
  border-color: #2563eb;
  background: #2563eb;
  color: #fff;
}

.hint,
.comment-meta time {
  font-size: 13px;
  line-height: 1.7;
  color: #666;
}

.hint {
  margin: 0;
}

.comments-heading + .hint {
  margin-top: 12px;
}

.comment-card {
  padding: 20px 0;
  border-bottom: 1px solid #eee;
}

.comment-meta time {
  margin-left: auto;
}

.guest-label {
  font-size: 12px;
  color: #777;
}

.comment-content {
  margin: 12px 0 0;
  white-space: pre-wrap;
  line-height: 1.8;
}

.pagination {
  justify-content: center;
  margin-top: 24px;
}

.error,
.captcha-error {
  color: #a4262c;
}

.success {
  color: #176438;
}

.honeypot {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}

.captcha {
  width: 100%;
  min-height: 65px;
}

.comment-ip {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-top: 10px;
  font-size: 13px;
  color: #666;
}

.ip-toggle {
  min-height: 36px;
  padding: 4px 10px;
  font-size: 13px;
}

.private-ip {
  margin: 10px 0 0;
  padding: 10px 12px;
  border: 1px solid #e6d39a;
  border-radius: 6px;
  background: #fff9e8;
  color: #604b14;
  font-size: 13px;
  overflow-wrap: anywhere;
}

</style>