<script setup lang="ts">
const { data: articles } = await useAsyncData('tech-articles', () => {
  return queryCollection('tech')
      .order('date', 'DESC')
      .all()
})
</script>

<template>
  <section class="tech-page">
    <div class="page-header">
      <p class="page-label">TECH</p>

      <h1>技術紀錄</h1>

      <p class="page-description">
        記錄軟體開發、Java、Spring Boot、Vue、Nuxt、DevOps、AI 與資安相關的實作與研究。
      </p>
    </div>

    <div class="article-list">
      <article
          v-for="article in articles"
          :key="article.path"
          class="article-card"
      >
        <small class="article-date">
          {{ article.date }}
        </small>

        <h2>
          <NuxtLink :to="article.path">
            {{ article.title }}
          </NuxtLink>
        </h2>

        <p>
          {{ article.description }}
        </p>

        <NuxtLink
            class="read-more"
            :to="article.path"
        >
          閱讀文章 →
        </NuxtLink>
      </article>
    </div>
  </section>
</template>

<style scoped>
.tech-page {
  padding-bottom: 80px;
}

.page-header {
  padding: 40px 0 56px;
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

.article-list {
  display: grid;
  gap: 20px;
}

.article-card {
  padding: 28px;
  border: 1px solid #e5e5e5;
  border-radius: 12px;
}

.article-date {
  color: #777;
}

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

.article-card p {
  margin: 0 0 20px;
  line-height: 1.8;
  color: #555;
}

.read-more {
  font-weight: 600;
  color: #222;
  text-decoration: none;
}

.read-more:hover {
  text-decoration: underline;
}

@media (max-width: 768px) {
  .page-header {
    padding: 24px 0 40px;
  }

  .page-header h1 {
    font-size: 34px;
  }

  .page-description {
    font-size: 16px;
  }

  .article-card {
    padding: 20px;
  }

  .article-card h2 {
    font-size: 21px;
  }
}
</style>