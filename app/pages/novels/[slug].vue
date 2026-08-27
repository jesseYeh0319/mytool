<script setup lang="ts">
const route = useRoute()

const slug = route.params.slug as string

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
            class="chapter-item"
        >
          <div>
            <span class="chapter-number">
              第 {{ chapter.chapter }} 章
            </span>

            <strong>
              {{ chapter.title }}
            </strong>
          </div>

          <span class="chapter-status">
            {{ chapter.isFree ? '免費' : '付費' }}
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

.chapter-number {
  margin-right: 12px;

  font-size: 14px;
  color: #777;
}

.chapter-status {
  font-size: 14px;
  color: #777;
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