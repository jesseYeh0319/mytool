<script setup lang="ts">
const route = useRoute()

const slug = route.params.slug as string

interface NovelProgress {
  chapter: string
  chapterTitle: string
  progress: number
  updatedAt: string
}

const readingProgress = ref<NovelProgress | null>(null)

onMounted(() => {
  try {
    const savedProgress = localStorage.getItem(`novel-progress:${slug}`)

    if (!savedProgress) return

    const parsed = JSON.parse(savedProgress) as Partial<NovelProgress>
    const progress = Number(parsed.progress)

    if (
        typeof parsed.chapter !== 'string' ||
        !parsed.chapter ||
        typeof parsed.chapterTitle !== 'string' ||
        !Number.isFinite(progress) ||
        progress < 0 ||
        progress > 100 ||
        typeof parsed.updatedAt !== 'string'
    ) return

    readingProgress.value = {
      chapter: parsed.chapter,
      chapterTitle: parsed.chapterTitle,
      progress: Math.round(progress),
      updatedAt: parsed.updatedAt
    }
  } catch {
    readingProgress.value = null
  }
})

const { data: book } = await useAsyncData(
    `novel-book-${slug}`,
    () => {
      return queryCollection('novelBooks')
          .where('stem', '=', `novels/${slug}/index`)
          .first()
    }
)

const { data: chapters } = await useAsyncData(
    `novel-chapters-${slug}`,
    () => {
      return queryCollection('novelChapters')
          .where('stem', 'LIKE', `novels/${slug}/%`)
          .order('chapter', 'ASC')
          .all()
    }
)
</script>

<template>
  <section
      v-if="book"
      class="novel-page"
  >
    <!-- 小說基本資料 -->
    <div class="novel-header">
      <div class="novel-meta">
        <span class="status">
          {{ book.status === 'ongoing' ? '連載中' : '已完結' }}
        </span>

        <span>
          作者：{{ book.author }}
        </span>
      </div>

      <h1>
        {{ book.title }}
      </h1>

      <p class="description">
        {{ book.description }}
      </p>
    </div>

    <!-- 繼續閱讀 -->
    <div
        v-if="readingProgress"
        class="continue-reading"
    >
      <div>
        <span class="continue-label">繼續閱讀</span>

        <h2>{{ readingProgress.chapterTitle }}</h2>

        <p>已閱讀 {{ readingProgress.progress }}%</p>
      </div>

      <NuxtLink
          :to="`/novels/${slug}/${readingProgress.chapter}`"
          class="continue-link"
      >
        繼續閱讀 →
      </NuxtLink>
    </div>

    <!-- 章節目錄 -->
    <div class="chapters-section">
      <div class="section-header">
        <h2>章節目錄</h2>

        <span>
          共 {{ chapters?.length ?? 0 }} 章
        </span>
      </div>

      <div class="chapter-list">
        <NuxtLink
            v-for="chapter in chapters"
            :key="chapter.path"
            :to="chapter.path"
            :class="[
              'chapter-item',
              { 'chapter-item--paid': chapter.isFree === false }
            ]"
        >
          <div>
            <span class="chapter-number">
              第 {{ chapter.chapter }} 章
            </span>

            <strong>
              {{ chapter.title }}
            </strong>
          </div>

          <span
              v-if="chapter.isFree === true"
              class="chapter-status chapter-status--free"
          >
            免費
          </span>

          <span
              v-else-if="chapter.isFree === false"
              class="chapter-status chapter-status--paid"
          >
            <span aria-hidden="true">🔒</span>
            付費
          </span>
        </NuxtLink>
      </div>
    </div>
  </section>
</template>

<style scoped>
.novel-page {
  padding-bottom: 80px;
}

.novel-header {
  padding: 48px 0 56px;
  border-bottom: 1px solid #e5e5e5;
}

.novel-meta {
  display: flex;
  align-items: center;
  gap: 16px;

  margin-bottom: 16px;

  font-size: 14px;
  color: #777;
}

.status {
  padding: 4px 10px;

  border-radius: 999px;

  background: #f2f2f2;

  font-weight: 600;
  color: #333;
}

.novel-header h1 {
  margin: 0;

  font-size: 42px;
  line-height: 1.2;
}

.description {
  max-width: 700px;

  margin-top: 20px;

  font-size: 18px;
  line-height: 1.8;

  color: #555;
}

.continue-reading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;

  margin-top: 48px;
  padding: 24px;

  border: 1px solid #e5e5e5;
  border-radius: 12px;

  background: #fafafa;
}

.continue-label {
  display: block;
  margin-bottom: 8px;

  font-size: 14px;
  font-weight: 600;
  color: #777;
}

.continue-reading h2 {
  margin: 0;
  font-size: 24px;
}

.continue-reading p {
  margin: 8px 0 0;
  color: #777;
}

.continue-link {
  flex-shrink: 0;
  padding: 12px 18px;

  border-radius: 8px;

  background: #222;

  font-weight: 600;
  color: #fff;
  text-decoration: none;
}

.continue-link:hover {
  background: #444;
}

.chapters-section {
  padding-top: 48px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;

  margin-bottom: 20px;
}

.section-header h2 {
  margin: 0;
  font-size: 28px;
}

.section-header span {
  font-size: 14px;
  color: #777;
}

.chapter-list {
  display: grid;
  gap: 12px;
}

.chapter-item {
  display: flex;
  align-items: center;
  justify-content: space-between;

  padding: 18px 20px;

  border: 1px solid #e5e5e5;
  border-radius: 10px;

  color: #222;
  text-decoration: none;
}

.chapter-item:hover {
  background: #fafafa;
}

.chapter-item--paid {
  border-color: #ddd4c7;
  background: #fdfbf8;
}

.chapter-item--paid:hover {
  background: #f8f3ec;
}

.chapter-number {
  margin-right: 12px;

  font-size: 14px;
  color: #777;
}

.chapter-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;

  flex-shrink: 0;

  padding: 5px 10px;

  border-radius: 999px;

  font-size: 14px;
  font-weight: 600;
}

.chapter-status--free {
  background: #edf7f0;
  color: #34734a;
}

.chapter-status--paid {
  background: #f3ece3;
  color: #79572f;
}

@media (max-width: 768px) {
  .novel-header {
    padding: 24px 0 40px;
  }

  .novel-header h1 {
    font-size: 34px;
  }

  .description {
    font-size: 16px;
  }

  .continue-reading {
    align-items: flex-start;
    flex-direction: column;
    margin-top: 36px;
  }

  .continue-link {
    width: 100%;
    box-sizing: border-box;
    text-align: center;
  }

  .chapters-section {
    padding-top: 36px;
  }

  .chapter-item {
    align-items: flex-start;
    gap: 12px;
  }

  .chapter-number {
    display: block;
    margin: 0 0 4px;
  }
}
</style>
