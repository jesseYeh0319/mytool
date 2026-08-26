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
    <section>
      <h1>MYBB</h1>

      <p>
        技術筆記、開發紀錄與創作。
      </p>

      <p>
        這裡記錄我的軟體開發實務、技術學習，以及小說創作。
      </p>
    </section>

    <section>
      <h2>最新技術紀錄</h2>

      <article
          v-for="article in latestArticles"
          :key="article.path"
      >
        <h3>
          <NuxtLink :to="article.path">
            {{ article.title }}
          </NuxtLink>
        </h3>

        <p>{{ article.description }}</p>

        <small>{{ article.date }}</small>
      </article>

      <p>
        <NuxtLink to="/tech">
          查看所有技術紀錄
        </NuxtLink>
      </p>
    </section>

    <section>
      <h2>小說作品</h2>

      <article
          v-for="book in books"
          :key="book.path"
      >
        <h3>
          <NuxtLink :to="book.path">
            {{ book.title }}
          </NuxtLink>
        </h3>

        <p>{{ book.description }}</p>

        <small>
          作者：{{ book.author }}
        </small>
      </article>

      <p>
        <NuxtLink to="/novels">
          查看所有小說作品
        </NuxtLink>
      </p>
    </section>
  </div>
</template>