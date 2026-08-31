<script setup lang="ts">
const route = useRoute()

const slug = route.params.slug as string
const chapterSlug = route.params.chapter as string

// 取得目前章節
const { data: chapter } = await useAsyncData(
    `novel-chapter-${slug}-${chapterSlug}`,
    () => {
      return queryCollection('novelChapters')
          .where('stem', '=', `novels/${slug}/${chapterSlug}`)
          .first()
    }
)

// 找不到章節就回傳 404
if (!chapter.value) {
  throw createError({
    statusCode: 404,
    statusMessage: '找不到這個章節'
  })
}

// 取得小說資料
const { data: book } = await useAsyncData(
    `novel-book-${slug}`,
    () => {
      return queryCollection('novelBooks')
          .where('stem', '=', `novels/${slug}/index`)
          .first()
    }
)

// 取得所有章節，用來產生上一章 / 下一章
const { data: chapters } = await useAsyncData(
    `novel-navigation-${slug}`,
    () => {
      return queryCollection('novelChapters')
          .where('stem', 'LIKE', `novels/${slug}/%`)
          .order('chapter', 'ASC')
          .all()
    }
)

const currentIndex = computed(() => {
  return chapters.value?.findIndex(
      item => item.path === chapter.value?.path
  ) ?? -1
})

const previousChapter = computed(() => {
  if (!chapters.value || currentIndex.value <= 0) {
    return null
  }

  return chapters.value[currentIndex.value - 1]
})

const nextChapter = computed(() => {
  if (
      !chapters.value ||
      currentIndex.value < 0 ||
      currentIndex.value >= chapters.value.length - 1
  ) {
    return null
  }

  return chapters.value[currentIndex.value + 1]
})
</script>

<template>
  <article v-if="chapter" class="reader">
    <!-- 小說與章節資訊 -->
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

      <h1>{{ chapter.title }}</h1>
    </header>

    <!-- 小說正文 -->
    <div class="novel-content">
      <ContentRenderer :value="chapter" />
    </div>

    <!-- 上一章 / 目錄 / 下一章 -->
    <nav class="chapter-navigation">
      <NuxtLink
          v-if="previousChapter"
          :to="previousChapter.path"
      >
        ← 上一章
      </NuxtLink>

      <span v-else />

      <NuxtLink :to="`/novels/${slug}`">
        章節目錄
      </NuxtLink>

      <NuxtLink
          v-if="nextChapter"
          :to="nextChapter.path"
      >
        下一章 →
      </NuxtLink>

      <span v-else />
    </nav>
  </article>
</template>

<style scoped>
.reader {
  max-width: 760px;
  margin: 0 auto;
  padding-bottom: 80px;
}

.reader-header {
  padding: 40px 0 48px;
  text-align: center;
  border-bottom: 1px solid #e5e5e5;
}

.book-link {
  font-size: 14px;
  color: #777;
  text-decoration: none;
}

.book-link:hover {
  color: #222;
}

.chapter-number {
  margin: 24px 0 8px;
  font-size: 14px;
  color: #777;
}

.reader-header h1 {
  margin: 0;
  font-size: 36px;
  line-height: 1.3;
}

.novel-content {
  padding: 48px 0;

  font-size: 18px;
  line-height: 2;

  color: #292929;
}

.novel-content :deep(h1) {
  display: none;
}

.novel-content :deep(p) {
  margin: 0 0 1.6em;
}

.chapter-navigation {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 20px;

  padding-top: 32px;

  border-top: 1px solid #e5e5e5;
}

.chapter-navigation a {
  color: #222;
  text-decoration: none;
}

.chapter-navigation a:hover {
  text-decoration: underline;
}

.chapter-navigation a:last-of-type {
  text-align: right;
}

@media (max-width: 768px) {
  .reader-header {
    padding: 24px 0 36px;
  }

  .reader-header h1 {
    font-size: 30px;
  }

  .novel-content {
    padding: 36px 0;

    font-size: 17px;
    line-height: 1.9;
  }

  .chapter-navigation {
    gap: 12px;
    font-size: 14px;
  }
}
</style>