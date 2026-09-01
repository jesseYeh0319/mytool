<script setup lang="ts">

useSeoMeta({
  title: '技術紀錄 | MYBB',

  description:
      'Java、Spring Boot、Vue、Nuxt、DevOps、AI 與資安相關的開發實作與技術紀錄。',

  ogTitle: '技術紀錄 | MYBB',

  ogDescription:
      'Java、Spring Boot、Vue、Nuxt、DevOps、AI 與資安相關的開發實作與技術紀錄。',

  ogType: 'website',

  twitterCard: 'summary_large_image'
})

const { data: articles } = await useAsyncData(
    'tech-articles',
    () => {
      return queryCollection('tech')
          .order('date', 'DESC')
          .all()
    }
)

// 目前選擇的分類
const selectedCategory = ref('全部')

// 從所有文章自動產生分類
const categories = computed(() => {
  if (!articles.value) {
    return ['全部']
  }

  const values = articles.value
      .map(article => article.category)
      .filter(Boolean)

  return [
    '全部',
    ...Array.from(new Set(values))
  ]
})

// 根據分類篩選文章
const filteredArticles = computed(() => {
  if (!articles.value) {
    return []
  }

  if (selectedCategory.value === '全部') {
    return articles.value
  }

  return articles.value.filter(
      article =>
          article.category === selectedCategory.value
  )
})
</script>

<template>
  <section class="tech-page">
    <!-- 頁面標題 -->
    <div class="page-header">
      <p class="page-label">
        TECH
      </p>

      <h1>
        技術紀錄
      </h1>

      <p class="page-description">
        記錄軟體開發、Java、Spring Boot、Vue、Nuxt、DevOps、AI 與資安相關的實作與研究。
      </p>
    </div>

    <!-- Category -->
    <div class="category-filter">
      <button
          v-for="category in categories"
          :key="category"
          type="button"
          class="category-button"
          :class="{
          active: selectedCategory === category
        }"
          @click="selectedCategory = category"
      >
        {{ category }}
      </button>
    </div>

    <!-- 文章數量 -->
    <div class="article-count">
      共 {{ filteredArticles.length }} 篇文章
    </div>

    <!-- 文章列表 -->
    <div class="article-list">
      <article
          v-for="article in filteredArticles"
          :key="article.path"
          class="article-card"
      >
        <!-- 日期 + Category -->
        <div class="article-meta">
          <span class="article-date">
            {{ article.date }}
          </span>

          <span class="article-category">
            {{ article.category }}
          </span>
        </div>

        <!-- 標題 -->
        <h2>
          <NuxtLink :to="article.path">
            {{ article.title }}
          </NuxtLink>
        </h2>

        <!-- 說明 -->
        <p class="article-description">
          {{ article.description }}
        </p>

        <!-- Tags -->
        <div
            v-if="article.tags?.length"
            class="article-tags"
        >
          <span
              v-for="tag in article.tags"
              :key="tag"
              class="tag"
          >
            #{{ tag }}
          </span>
        </div>

        <!-- 閱讀文章 -->
        <NuxtLink
            class="read-more"
            :to="article.path"
        >
          閱讀文章 →
        </NuxtLink>
      </article>
    </div>

    <!-- 沒有文章 -->
    <div
        v-if="filteredArticles.length === 0"
        class="empty-state"
    >
      這個分類目前還沒有文章。
    </div>
  </section>
</template>

<style scoped>
.tech-page {
  padding-bottom: 80px;
}

/* -------------------------
   頁面標題
------------------------- */

.page-header {
  padding: 40px 0 48px;
}

.page-label {
  margin: 0 0 12px;

  font-size: 14px;
  font-weight: 700;

  letter-spacing: 2px;
}

.page-header h1 {
  margin: 0;

  font-size: 42px;
  line-height: 1.2;
}

.page-description {
  max-width: 680px;

  margin-top: 20px;

  font-size: 18px;
  line-height: 1.8;

  color: #555;
}

/* -------------------------
   Category Filter
------------------------- */

.category-filter {
  display: flex;
  flex-wrap: wrap;

  gap: 10px;

  margin-bottom: 20px;
}

.category-button {
  padding: 8px 14px;

  border: 1px solid #ddd;
  border-radius: 999px;

  background: white;

  font-size: 14px;
  color: #444;

  cursor: pointer;

  transition:
      background 0.15s ease,
      color 0.15s ease,
      border-color 0.15s ease;
}

.category-button:hover {
  border-color: #aaa;
}

.category-button.active {
  border-color: #222;

  background: #222;

  color: white;
}

/* -------------------------
   Article Count
------------------------- */

.article-count {
  margin-bottom: 20px;

  font-size: 14px;

  color: #777;
}

/* -------------------------
   Article List
------------------------- */

.article-list {
  display: grid;

  gap: 20px;
}

.article-card {
  padding: 28px;

  border: 1px solid #e5e5e5;
  border-radius: 12px;
}

/* 日期 + Category */

.article-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;

  gap: 10px;

  margin-bottom: 10px;

  font-size: 14px;

  color: #777;
}

.article-category {
  padding: 4px 9px;

  border-radius: 999px;

  background: #f2f2f2;

  color: #444;
}

/* 標題 */

.article-card h2 {
  margin: 10px 0;

  font-size: 24px;
}

.article-card h2 a {
  color: #222;

  text-decoration: none;
}

.article-card h2 a:hover {
  text-decoration: underline;
}

/* Description */

.article-description {
  margin: 0 0 16px;

  line-height: 1.8;

  color: #555;
}

/* Tags */

.article-tags {
  display: flex;
  flex-wrap: wrap;

  gap: 8px;

  margin-bottom: 20px;
}

.tag {
  padding: 4px 9px;

  border: 1px solid #e5e5e5;
  border-radius: 999px;

  font-size: 13px;

  color: #666;

  background: #fafafa;
}

/* 閱讀文章 */

.read-more {
  font-weight: 600;

  color: #222;

  text-decoration: none;
}

.read-more:hover {
  text-decoration: underline;
}

/* -------------------------
   Empty State
------------------------- */

.empty-state {
  padding: 48px 20px;

  text-align: center;

  color: #777;
}

/* -------------------------
   手機
------------------------- */

@media (max-width: 768px) {
  .page-header {
    padding: 24px 0 36px;
  }

  .page-header h1 {
    font-size: 34px;
  }

  .page-description {
    font-size: 16px;
  }

  .category-filter {
    gap: 8px;
  }

  .category-button {
    padding: 7px 12px;

    font-size: 13px;
  }

  .article-card {
    padding: 20px;
  }

  .article-card h2 {
    font-size: 21px;
  }
}
</style>