<script setup lang="ts">
const { data: articles } = await useAsyncData(
    'tech-articles',
    () => {
      return queryCollection('tech')
          .order('date', 'DESC')
          .all()
    }
)

/* =========================
   SEO
========================= */

useSeoMeta({
  title: '技術紀錄 | MYBB',

  description:
      '記錄 Java、Spring Boot、Vue、Nuxt、DevOps 與軟體開發相關技術內容。',

  ogTitle: '技術紀錄 | MYBB',

  ogDescription:
      '記錄 Java、Spring Boot、Vue、Nuxt、DevOps 與軟體開發相關技術內容。'
})

/* =========================
   Filter
========================= */

const selectedCategory = ref('全部')
const selectedTag = ref('')
const searchKeyword = ref('')

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

const filteredArticles = computed(() => {
  if (!articles.value) {
    return []
  }

  const keyword = searchKeyword.value
      .trim()
      .toLowerCase()

  return articles.value.filter(article => {
    /* Category */

    const categoryMatched =
        selectedCategory.value === '全部'
        || article.category === selectedCategory.value

    if (!categoryMatched) {
      return false
    }

    /* Tag */

    const tagMatched =
        !selectedTag.value
        || article.tags?.includes(selectedTag.value)

    if (!tagMatched) {
      return false
    }

    /* Search */

    if (!keyword) {
      return true
    }

    const searchableText = [
      article.title,
      article.description,
      article.category,
      ...(article.tags ?? [])
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

    return searchableText.includes(keyword)
  })
})

function clearSearch() {
  searchKeyword.value = ''
}

function selectTag(tag: string) {
  selectedTag.value =
      selectedTag.value === tag
          ? ''
          : tag
}

function clearAllFilters() {
  selectedCategory.value = '全部'
  selectedTag.value = ''
  searchKeyword.value = ''
}
</script>

<template>
  <section class="tech-page">
    <header class="page-header">
      <p class="page-label">
        TECH
      </p>

      <h1>
        技術紀錄
      </h1>

      <p class="page-description">
        記錄軟體開發、Java、Spring Boot、Vue、Nuxt、DevOps
        與其他技術學習內容。
      </p>
    </header>

    <!-- Search -->

    <div class="search-area">
      <div class="search-box">
        <input
            v-model="searchKeyword"
            class="search-input"
            type="search"
            placeholder="搜尋文章、技術或標籤..."
            aria-label="搜尋技術文章"
        >

        <button
            v-if="searchKeyword"
            class="clear-button"
            type="button"
            aria-label="清除搜尋"
            @click="clearSearch"
        >
          清除
        </button>
      </div>
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

    <!-- Result Info -->

    <div class="result-info">
      <span>
        共 {{ filteredArticles.length }} 篇文章
      </span>

      <span
          v-if="searchKeyword"
          class="filter-info"
      >
        搜尋「{{ searchKeyword }}」
      </span>

      <span
          v-if="selectedTag"
          class="selected-tag"
      >
        #{{ selectedTag }}

        <button
            type="button"
            class="remove-tag"
            aria-label="取消標籤篩選"
            @click="selectedTag = ''"
        >
          ×
        </button>
      </span>

      <button
          v-if="
          searchKeyword
          || selectedTag
          || selectedCategory !== '全部'
        "
          type="button"
          class="clear-all-button"
          @click="clearAllFilters"
      >
        清除全部篩選
      </button>
    </div>

    <!-- Articles -->

    <div
        v-if="filteredArticles.length"
        class="article-list"
    >
      <article
          v-for="article in filteredArticles"
          :key="article.path"
          class="article-card"
      >
        <div class="article-meta">
          <span class="article-date">
            {{ article.date }}
          </span>

          <span
              v-if="article.category"
              class="article-category"
          >
            {{ article.category }}
          </span>
        </div>

        <NuxtLink
            :to="article.path"
            class="article-title-link"
        >
          <h2 class="article-title">
            {{ article.title }}
          </h2>
        </NuxtLink>

        <p class="article-description">
          {{ article.description }}
        </p>

        <div
            v-if="article.tags?.length"
            class="article-tags"
        >
          <button
              v-for="tag in article.tags"
              :key="tag"
              type="button"
              class="tag"
              :class="{
              active: selectedTag === tag
            }"
              @click="selectTag(tag)"
          >
            #{{ tag }}
          </button>
        </div>

        <NuxtLink
            :to="article.path"
            class="read-link"
        >
          閱讀文章 →
        </NuxtLink>
      </article>
    </div>

    <!-- Empty -->

    <div
        v-else
        class="empty-state"
    >
      <p>
        找不到符合條件的文章。
      </p>

      <button
          type="button"
          class="reset-button"
          @click="clearAllFilters"
      >
        清除全部篩選
      </button>
    </div>
  </section>
</template>

<style scoped>
.tech-page {
  max-width: 900px;
  margin: 0 auto;
  padding-bottom: 100px;
}

/* =========================
   Header
========================= */

.page-header {
  margin-bottom: 40px;
}

.page-label {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.14em;
  color: #777;
}

.page-header h1 {
  margin: 0;
  font-size: 42px;
  line-height: 1.25;
  color: #1f1f1f;
}

.page-description {
  max-width: 680px;
  margin: 18px 0 0;
  font-size: 17px;
  line-height: 1.8;
  color: #666;
}

/* =========================
   Search
========================= */

.search-area {
  margin-bottom: 24px;
}

.search-box {
  position: relative;
  max-width: 620px;
}

.search-input {
  width: 100%;
  box-sizing: border-box;
  padding: 14px 80px 14px 16px;
  border: 1px solid #d8d8d8;
  border-radius: 10px;
  outline: none;
  background: white;
  font: inherit;
  font-size: 15px;
  color: #222;
  transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease;
}

.search-input::placeholder {
  color: #999;
}

.search-input:focus {
  border-color: #888;
  box-shadow: 0 0 0 3px rgb(0 0 0 / 5%);
}

.clear-button {
  position: absolute;
  top: 50%;
  right: 12px;
  padding: 5px 8px;
  border: 0;
  background: transparent;
  color: #777;
  cursor: pointer;
  transform: translateY(-50%);
}

.clear-button:hover {
  color: #111;
}

/* =========================
   Category
========================= */

.category-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 24px;
}

.category-button {
  padding: 8px 14px;
  border: 1px solid #ddd;
  border-radius: 999px;
  background: white;
  font: inherit;
  font-size: 14px;
  color: #555;
  cursor: pointer;
  transition:
      background 0.15s ease,
      border-color 0.15s ease,
      color 0.15s ease;
}

.category-button:hover {
  border-color: #aaa;
  color: #111;
}

.category-button.active {
  border-color: #222;
  background: #222;
  color: white;
}

/* =========================
   Result
========================= */

.result-info {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 16px;
  font-size: 14px;
  color: #777;
}

.filter-info {
  color: #444;
}

.selected-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 999px;
  background: #f2f2f2;
  color: #444;
}

.remove-tag {
  padding: 0 2px;
  border: 0;
  background: transparent;
  font-size: 16px;
  line-height: 1;
  color: #777;
  cursor: pointer;
}

.remove-tag:hover {
  color: #111;
}

.clear-all-button {
  padding: 4px 0;
  border: 0;
  background: transparent;
  font: inherit;
  font-size: 13px;
  color: #777;
  text-decoration: underline;
  cursor: pointer;
}

.clear-all-button:hover {
  color: #111;
}

/* =========================
   Articles
========================= */

.article-list {
  border-top: 1px solid #e5e5e5;
}

.article-card {
  padding: 32px 0;
  border-bottom: 1px solid #e5e5e5;
}

.article-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 10px;
  font-size: 13px;
  color: #888;
}

.article-category {
  padding: 4px 9px;
  border-radius: 999px;
  background: #f2f2f2;
  color: #555;
}

.article-title-link {
  color: inherit;
  text-decoration: none;
}

.article-title {
  margin: 0;
  font-size: 26px;
  line-height: 1.4;
  color: #222;
}

.article-title-link:hover .article-title {
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 4px;
}

.article-description {
  margin: 12px 0 0;
  font-size: 15px;
  line-height: 1.8;
  color: #666;
}

.article-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

.tag {
  padding: 5px 9px;
  border: 1px solid #e6e6e6;
  border-radius: 999px;
  background: #fafafa;
  font: inherit;
  font-size: 12px;
  color: #666;
  cursor: pointer;
  transition:
      background 0.15s ease,
      border-color 0.15s ease,
      color 0.15s ease;
}

.tag:hover {
  border-color: #aaa;
  color: #222;
}

.tag.active {
  border-color: #222;
  background: #222;
  color: white;
}

.read-link {
  display: inline-block;
  margin-top: 20px;
  font-size: 14px;
  font-weight: 600;
  color: #222;
  text-decoration: none;
}

.read-link:hover {
  text-decoration: underline;
}

/* =========================
   Empty
========================= */

.empty-state {
  padding: 60px 20px;
  border-top: 1px solid #e5e5e5;
  text-align: center;
  color: #777;
}

.reset-button {
  margin-top: 10px;
  padding: 8px 14px;
  border: 1px solid #ddd;
  border-radius: 8px;
  background: white;
  font: inherit;
  color: #444;
  cursor: pointer;
}

.reset-button:hover {
  background: #f5f5f5;
}

/* =========================
   Mobile
========================= */

@media (max-width: 768px) {
  .page-header {
    margin-bottom: 32px;
  }

  .page-header h1 {
    font-size: 34px;
  }

  .page-description {
    font-size: 16px;
  }

  .search-box {
    max-width: none;
  }

  .article-card {
    padding: 26px 0;
  }

  .article-title {
    font-size: 23px;
  }
}
</style>