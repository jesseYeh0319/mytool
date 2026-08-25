<script setup lang="ts">
const { data: books } = await useAsyncData('novel-books', () => {
  return queryCollection('novelBooks').all()
})
</script>

<template>
  <main>
    <h1>小說</h1>

    <article v-for="book in books" :key="book.path">
      <h2>
        <NuxtLink :to="book.path">
          {{ book.title }}
        </NuxtLink>
      </h2>

      <p>
        {{ book.description }}
      </p>

      <small>
        作者：{{ book.author }}
      </small>
    </article>
  </main>
</template>