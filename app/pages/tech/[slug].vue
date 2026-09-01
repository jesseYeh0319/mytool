<script setup lang="ts">
const route = useRoute()
const slug = route.params.slug as string

const { data: article } = await useAsyncData(
    `tech-article-${slug}`,
    () => {
      return queryCollection('tech')
          .where('stem', '=', `tech/${slug}`)
          .first()
    }
)

if (!article.value) {
  throw createError({
    statusCode: 404,
    statusMessage: '找不到這篇文章'
  })
}
</script>

<template>
  <article
      v-if="article"
      class="article-page"
  >
    <header class="article-header">
      <NuxtLink
          to="/tech"
          class="back-link"
      >
        ← 返回技術紀錄
      </NuxtLink>

      <p class="article-date">
        {{ article.date }}
      </p>

      <h1>
        {{ article.title }}
      </h1>

      <p class="article-description">
        {{ article.description }}
      </p>
    </header>

    <div class="article-content">
      <ContentRenderer :value="article" />
    </div>

    <footer class="article-footer">
      <NuxtLink
          to="/tech"
          class="back-button"
      >
        ← 返回技術紀錄
      </NuxtLink>
    </footer>
  </article>
</template>

<style scoped>
.article-page {
  max-width: 780px;
  margin: 0 auto;
  padding-bottom: 100px;
}

/* 文章標題區 */

.article-header {
  padding: 40px 0 48px;
  border-bottom: 1px solid #e5e5e5;
}

.back-link {
  display: inline-block;
  margin-bottom: 28px;

  font-size: 14px;

  color: #666;
  text-decoration: none;
}

.back-link:hover {
  color: #111;
}

.article-date {
  margin: 0 0 12px;

  font-size: 14px;

  color: #777;
}

.article-header h1 {
  margin: 0;

  font-size: 42px;
  line-height: 1.25;

  color: #1f1f1f;
}

.article-description {
  margin: 20px 0 0;

  font-size: 18px;
  line-height: 1.8;

  color: #555;
}

/* 正文 */

.article-content {
  padding: 56px 0;

  font-size: 17px;
  line-height: 1.9;

  color: #292929;
}

/*
Markdown 裡如果本身又有 H1，
避免和頁面標題重複。
*/
.article-content :deep(h1) {
  display: none;
}

.article-content :deep(h2) {
  margin: 2.5em 0 0.8em;

  font-size: 28px;
  line-height: 1.4;

  color: #222;
}

.article-content :deep(h2 a),
.article-content :deep(h3 a) {
  color: inherit;
  text-decoration: none;
}

.article-content :deep(h3) {
  margin: 2em 0 0.7em;

  font-size: 22px;
  line-height: 1.5;

  color: #333;
}

.article-content :deep(p) {
  margin: 0 0 1.5em;
}

.article-content :deep(ul),
.article-content :deep(ol) {
  margin: 0 0 1.5em;
  padding-left: 1.6em;
}

.article-content :deep(li) {
  margin-bottom: 0.5em;
}

.article-content :deep(blockquote) {
  margin: 2em 0;
  padding: 4px 0 4px 20px;

  border-left: 3px solid #ccc;

  color: #666;
}

/* Inline code */

.article-content :deep(:not(pre) > code) {
  padding: 3px 7px;

  border: 1px solid #e5e5e5;
  border-radius: 5px;

  background: #f5f5f5;

  font-family:
      "SFMono-Regular",
      Consolas,
      "Liberation Mono",
      Menlo,
      monospace;

  font-size: 0.88em;

  color: #c7254e;
}

/* Code block */

.article-content :deep(pre) {
  overflow-x: auto;

  margin: 2em 0;
  padding: 22px 24px;

  border: 1px solid #333;
  border-radius: 10px;

  background: #1e1e1e;

  font-size: 14px;
  line-height: 1.7;

  tab-size: 4;
}

.article-content :deep(pre code) {
  padding: 0;

  border: 0;

  background: transparent;

  font-family:
      "SFMono-Regular",
      Consolas,
      "Liberation Mono",
      Menlo,
      monospace;

  font-size: inherit;

  color: #e6e6e6;
}

/* 長程式碼允許左右捲動 */

.article-content :deep(pre::-webkit-scrollbar) {
  height: 8px;
}

.article-content :deep(pre::-webkit-scrollbar-thumb) {
  border-radius: 4px;
  background: #555;
}

.article-content :deep(a) {
  color: #2563eb;
}

.article-content :deep(img) {
  max-width: 100%;
  height: auto;

  margin: 2em 0;

  border-radius: 8px;
}

/* Footer */

.article-footer {
  padding-top: 32px;

  border-top: 1px solid #e5e5e5;
}

.back-button {
  display: inline-block;

  padding: 10px 16px;

  border: 1px solid #ddd;
  border-radius: 8px;

  color: #222;
  text-decoration: none;
}

.back-button:hover {
  background: #f5f5f5;
}

/* 手機 */

@media (max-width: 768px) {
  .article-header {
    padding: 24px 0 36px;
  }

  .article-header h1 {
    font-size: 34px;
  }

  .article-description {
    font-size: 16px;
  }

  .article-content {
    padding: 40px 0;

    font-size: 16px;
    line-height: 1.85;
  }

  .article-content :deep(h2) {
    font-size: 24px;
  }

  .article-content :deep(h3) {
    font-size: 20px;
  }
}
</style>