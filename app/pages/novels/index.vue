<script setup lang="ts">
const { data: books } = await useAsyncData('novel-books', () => {
  return queryCollection('novelBooks')
      .all()
})
</script>

<template>
  <section class="novels-page">
    <!-- 頁面標題 -->
    <div class="page-header">
      <p class="page-label">NOVELS</p>

      <h1>小說作品</h1>

      <p class="page-description">
        收錄我的小說創作、連載作品與章節內容。
      </p>
    </div>

    <!-- 小說列表 -->
    <div class="novel-list">
      <article
          v-for="book in books"
          :key="book.path"
          class="novel-card"
      >
        <div class="novel-meta">
          <span
              class="status"
              :class="{
              ongoing: book.status === 'ongoing',
              completed: book.status !== 'ongoing'
            }"
          >
            {{ book.status === 'ongoing' ? '連載中' : '已完結' }}
          </span>

          <span class="author">
            作者：{{ book.author }}
          </span>
        </div>

        <h2>
          <NuxtLink :to="book.path">
            {{ book.title }}
          </NuxtLink>
        </h2>

        <p>
          {{ book.description }}
        </p>

        <NuxtLink
            class="read-more"
            :to="book.path"
        >
          查看作品 →
        </NuxtLink>
      </article>
    </div>
  </section>
</template>

<style scoped>
.novels-page {
  padding-bottom: 80px;
}

/* 頁面標題 */

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

/* 小說列表 */

.novel-list {
  display: grid;
  gap: 20px;
}

.novel-card {
  padding: 28px;
  border: 1px solid #e5e5e5;
  border-radius: 12px;
}

.novel-meta {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 12px;
}

.status {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  background: #f2f2f2;
}

.author {
  font-size: 14px;
  color: #777;
}

.novel-card h2 {
  margin: 10px 0;
  font-size: 24px;
}

.novel-card h2 a {
  color: #222;
  text-decoration: none;
}

.novel-card h2 a:hover {
  text-decoration: underline;
}

.novel-card p {
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

/* 手機版 */

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

  .novel-card {
    padding: 20px;
  }

  .novel-card h2 {
    font-size: 21px;
  }

  .novel-meta {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
  }
}
</style>