<script setup lang="ts">
const { data: latestArticles } = await useAsyncData('latest-tech-articles', () => {
  return queryCollection('tech')
      .order('date', 'DESC')
      .limit(3)
      .all()
})

const { data: books } = await useAsyncData('homepage-novel-books', () => {
  return queryCollection('novelBooks')
      .limit(3)
      .all()
})
</script>

<template>
  <div>
    <!-- Hero -->
    <section class="hero">
      <p class="hero-label">MYBB</p>

      <h1>記錄技術，也寫故事。</h1>

      <p class="hero-description">
        這裡記錄我的軟體開發實務、技術學習，以及小說創作。
      </p>

      <div class="hero-actions">
        <NuxtLink class="primary-button" to="/tech">
          閱讀技術文章
        </NuxtLink>

        <NuxtLink class="secondary-button" to="/novels">
          閱讀小說
        </NuxtLink>
      </div>
    </section>

    <!-- 最新技術紀錄 -->
    <section class="content-section">
      <div class="section-header">
        <h2>最新技術紀錄</h2>

        <NuxtLink to="/tech">
          查看全部
        </NuxtLink>
      </div>

      <div class="card-grid">
        <article
            v-for="article in latestArticles"
            :key="article.path"
            class="content-card"
        >
          <small class="card-meta">
            {{ article.date }}
          </small>

          <h3>
            <NuxtLink :to="article.path">
              {{ article.title }}
            </NuxtLink>
          </h3>

          <p>
            {{ article.description }}
          </p>
        </article>
      </div>
    </section>

    <!-- 小說作品 -->
    <section class="content-section">
      <div class="section-header">
        <h2>小說作品</h2>

        <NuxtLink to="/novels">
          查看全部
        </NuxtLink>
      </div>

      <div class="card-grid">
        <article
            v-for="book in books"
            :key="book.path"
            class="content-card"
        >
          <small class="card-meta">
            {{ book.status === 'ongoing' ? '連載中' : '已完結' }}
          </small>

          <h3>
            <NuxtLink :to="book.path">
              {{ book.title }}
            </NuxtLink>
          </h3>

          <p>
            {{ book.description }}
          </p>

          <small class="book-author">
            作者：{{ book.author }}
          </small>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.hero {
  padding: 80px 0;
}

.hero-label {
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 2px;
}

.hero h1 {
  margin: 0;
  font-size: 48px;
  line-height: 1.2;
}

.hero-description {
  max-width: 600px;
  margin-top: 24px;
  font-size: 18px;
  line-height: 1.8;
  color: #555;
}

.hero-actions {
  display: flex;
  gap: 12px;
  margin-top: 32px;
}

.primary-button,
.secondary-button {
  display: inline-block;
  padding: 12px 20px;
  border-radius: 8px;
  text-decoration: none;
}

.primary-button {
  background: #111;
  color: white;
}

.secondary-button {
  border: 1px solid #ddd;
  color: #222;
}

.content-section {
  padding: 48px 0;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}

.section-header h2 {
  margin: 0;
  font-size: 28px;
}

.section-header a {
  color: #444;
  text-decoration: none;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}

.content-card {
  padding: 24px;
  border: 1px solid #e5e5e5;
  border-radius: 12px;
}

.content-card h3 {
  margin: 10px 0;
  font-size: 20px;
}

.content-card h3 a {
  color: #222;
  text-decoration: none;
}

.content-card h3 a:hover {
  text-decoration: underline;
}

.content-card p {
  margin: 0 0 16px;
  line-height: 1.7;
  color: #555;
}

.card-meta,
.book-author {
  color: #777;
}

/* 手機版 */

@media (max-width: 768px) {
  .hero {
    padding: 48px 0;
  }

  .hero h1 {
    font-size: 36px;
  }

  .hero-description {
    font-size: 16px;
  }

  .hero-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .primary-button,
  .secondary-button {
    text-align: center;
  }

  .content-section {
    padding: 32px 0;
  }

  .card-grid {
    grid-template-columns: 1fr;
  }

  .section-header h2 {
    font-size: 24px;
  }
}
</style>