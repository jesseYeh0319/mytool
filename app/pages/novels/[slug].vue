<script setup lang="ts">
const route = useRoute()

const slug = route.params.slug as string

// 取得小說作品資料
const { data: book } = await useAsyncData(
    `novel-book-${slug}`,
    () => {
      return queryCollection('novelBooks')
          .where('stem', '=', `novels/${slug}/index`)
          .first()
    }
)

// 取得這本小說的所有章節
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
  <main v-if="book">
    <h1>{{ book.title }}</h1>

    <p>{{ book.description }}</p>

    <p>作者：{{ book.author }}</p>

    <p>
      狀態：
      {{ book.status === 'ongoing' ? '連載中' : '已完結' }}
    </p>

    <h2>章節目錄</h2>

    <ul>
      <li v-for="chapter in chapters" :key="chapter.path">
        <NuxtLink :to="chapter.path">
          第 {{ chapter.chapter }} 章：{{ chapter.title }}
        </NuxtLink>

        <span>
          {{ chapter.isFree ? '免費' : '付費' }}
        </span>
      </li>
    </ul>
  </main>
</template>