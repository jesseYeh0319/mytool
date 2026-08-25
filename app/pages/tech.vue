<script setup lang="ts">
const { data: articles } = await useAsyncData('tech-articles', () => {
  return queryCollection('tech')
      .order('date', 'DESC')
      .all()
})
</script>

<template>
  <main>
    <h1>技術紀錄</h1>

    <article v-for="article in articles" :key="article.path">
      <h2>
        <NuxtLink :to="article.path">
          {{ article.title }}
        </NuxtLink>
      </h2>

      <p>{{ article.description }}</p>

      <small>{{ article.date }}</small>
    </article>
  </main>
</template>