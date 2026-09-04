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

const slug = route.params.slug as string
const chapterSlug = route.params.chapter as string

type ReadingMode = 'light' | 'sepia' | 'dark'

const fontSize = ref(18)
const readingMode = ref<ReadingMode>('light')
const novelContent = ref<HTMLElement | null>(null)

const FONT_SIZE_KEY = 'novel-font-size'
const READING_MODE_KEY = 'novel-reading-mode'
const PROGRESS_KEY = `novel-progress:${slug}`

let progressAnimationFrame: number | null = null
let progressInitialized = false

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
    refreshChapterAccess,
    { immediate: true }
)

watch(canReadChapter, async (canRead) => {
  if (canRead) {
    await enableProgressTracking()
  } else {
    disableProgressTracking()
  }
}, { flush: 'post' })

async function handleUnlock() {
  if (!user.value) {
    await navigateTo({
      path: '/login',
      query: {
        redirect: route.fullPath,
      },
    })

    return
  }

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

    await $fetch('/api/chapters/unlock', {
      method: 'POST',

      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },

      body: {
        bookSlug: slug,
        chapterSlug: chapterSlug,
      },
    })

    await refreshChapterAccess()
  } catch (error) {
    console.error('解鎖章節失敗:', error)
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

  localStorage.setItem(
      PROGRESS_KEY,
      JSON.stringify({
        chapter: chapterSlug,
        chapterTitle: chapter.value.title,
        progress,
        updatedAt: new Date().toISOString()
      })
  )
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
  if (!canReadChapter.value) {
    return
  }

  let savedProgress: SavedReadingProgress | null = null

  try {
    const savedValue = localStorage.getItem(PROGRESS_KEY)

    if (savedValue) {
      savedProgress = JSON.parse(savedValue) as SavedReadingProgress
    }
  } catch {
    savedProgress = null
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

  if (
      !novelContent.value ||
      savedProgress?.chapter !== chapterSlug ||
      !Number.isFinite(savedProgress.progress)
  ) {
    return
  }

  const progress = Math.min(
      Math.max(savedProgress.progress, 0),
      100
  )
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

        <button
            type="button"
            class="unlock-button"
            @click="handleUnlock"
        >
          {{ user ? '解鎖本章' : '登入並解鎖' }}
        </button>
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
  </article>
</template>

<style scoped>
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

@media (max-width: 768px) {
  .reader-wrapper {
    margin-top: -24px;

    padding-top: 24px;
    padding-bottom: 60px;
  }

  .reader-toolbar {
    align-items: flex-start;

    flex-direction: column;
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
}
</style>
