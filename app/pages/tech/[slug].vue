<script setup lang="ts">
const route = useRoute()

const slug = route.params.slug as string

/* =========================
   Current Article
========================= */

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

/* =========================
   All Articles
   用來取得上一篇 / 下一篇
========================= */

const { data: allArticles } = await useAsyncData(
    'tech-article-navigation',
    () => {
      return queryCollection('tech')
          .order('date', 'DESC')
          .all()
    }
)

const currentArticleIndex = computed(() => {
  if (!allArticles.value || !article.value) {
    return -1
  }

  return allArticles.value.findIndex(
      item => item.path === article.value?.path
  )
})

/*
 * 文章依日期 DESC 排列：
 *
 * index 0 = 最新
 * index 1 = 第二新
 * index 2 = 第三新
 *
 * 所以：
 *
 * previousArticle = 比目前更新的文章
 * nextArticle     = 比目前更舊的文章
 */

const previousArticle = computed(() => {
  if (!allArticles.value) {
    return null
  }

  const index = currentArticleIndex.value

  if (index <= 0) {
    return null
  }

  return allArticles.value[index - 1] ?? null
})

const nextArticle = computed(() => {
  if (!allArticles.value) {
    return null
  }

  const index = currentArticleIndex.value

  if (
      index < 0
      || index >= allArticles.value.length - 1
  ) {
    return null
  }

  return allArticles.value[index + 1] ?? null
})

/* =========================
   SEO
========================= */

useSeoMeta({
  title: () =>
      `${article.value?.title ?? '技術文章'} | MYBB`,

  description: () =>
      article.value?.description ?? 'MYBB 技術紀錄',

  ogTitle: () =>
      article.value?.title ?? 'MYBB 技術紀錄',

  ogDescription: () =>
      article.value?.description ?? 'MYBB 技術紀錄',

  ogType: 'article'
})

/* =========================
   TOC Active Section
========================= */

const activeHeadingId = ref('')

let headings: HTMLElement[] = []

function updateActiveHeading() {
  const firstHeading = headings[0]

  if (!firstHeading) {
    return
  }

  const readingLine = 120

  let currentHeading: HTMLElement = firstHeading

  for (const heading of headings) {
    const top = heading.getBoundingClientRect().top

    if (top <= readingLine) {
      currentHeading = heading
    } else {
      break
    }
  }

  activeHeadingId.value = currentHeading.id
}

function setupHeadingTracking() {
  headings = Array.from(
      document.querySelectorAll<HTMLElement>(
          '.article-content h2[id], .article-content h3[id]'
      )
  )

  const firstHeading = headings[0]

  if (!firstHeading) {
    return
  }

  activeHeadingId.value = firstHeading.id

  updateActiveHeading()

  window.addEventListener(
      'scroll',
      updateActiveHeading,
      {
        passive: true
      }
  )
}

onMounted(async () => {
  await nextTick()

  setupHeadingTracking()
})

onBeforeUnmount(() => {
  window.removeEventListener(
      'scroll',
      updateActiveHeading
  )
})

function isActiveHeading(id: string) {
  return activeHeadingId.value === id
}
</script>

<template>
  <article
      v-if="article"
      class="article-page"
  >
    <!-- =========================
         Header
    ========================== -->

    <header class="article-header">
      <NuxtLink
          to="/tech"
          class="back-link"
      >
        ← 返回技術紀錄
      </NuxtLink>

      <div class="article-meta">
        <span>
          {{ article.date }}
        </span>

        <span class="category">
          {{ article.category }}
        </span>
      </div>

      <h1>
        {{ article.title }}
      </h1>

      <p class="article-description">
        {{ article.description }}
      </p>

      <div
          v-if="article.tags?.length"
          class="article-tags"
      >
        <span
            v-for="tag in article.tags"
            :key="tag"
            class="tag"
        >
          #{{ tag }}
        </span>
      </div>
    </header>

    <!-- =========================
         Mobile TOC
    ========================== -->

    <nav
        v-if="article.body?.toc?.links?.length"
        class="mobile-toc"
        aria-label="本文目錄"
    >
      <p class="toc-title">
        本文目錄
      </p>

      <ul class="toc-list">
        <li
            v-for="link in article.body.toc.links"
            :key="link.id"
            class="toc-item"
        >
          <a
              :href="`#${link.id}`"
              :class="{
              active: isActiveHeading(link.id)
            }"
          >
            {{ link.text }}
          </a>

          <ul
              v-if="link.children?.length"
              class="toc-children"
          >
            <li
                v-for="child in link.children"
                :key="child.id"
            >
              <a
                  :href="`#${child.id}`"
                  :class="{
                  active: isActiveHeading(child.id)
                }"
              >
                {{ child.text }}
              </a>
            </li>
          </ul>
        </li>
      </ul>
    </nav>

    <!-- =========================
         Article Layout
    ========================== -->

    <div class="article-layout">
      <main class="article-content">
        <ContentRenderer :value="article" />
      </main>

      <!-- Desktop TOC -->

      <aside
          v-if="article.body?.toc?.links?.length"
          class="desktop-toc"
      >
        <nav
            class="toc-sticky"
            aria-label="本文目錄"
        >
          <p class="toc-title">
            本文目錄
          </p>

          <ul class="toc-list">
            <li
                v-for="link in article.body.toc.links"
                :key="link.id"
                class="toc-item"
            >
              <a
                  :href="`#${link.id}`"
                  :class="{
                  active: isActiveHeading(link.id)
                }"
              >
                {{ link.text }}
              </a>

              <ul
                  v-if="link.children?.length"
                  class="toc-children"
              >
                <li
                    v-for="child in link.children"
                    :key="child.id"
                >
                  <a
                      :href="`#${child.id}`"
                      :class="{
                      active: isActiveHeading(child.id)
                    }"
                  >
                    {{ child.text }}
                  </a>
                </li>
              </ul>
            </li>
          </ul>
        </nav>
      </aside>
    </div>

    <!-- =========================
         Previous / Next
    ========================== -->

    <nav
        v-if="previousArticle || nextArticle"
        class="article-navigation"
        aria-label="文章導覽"
    >
      <NuxtLink
          v-if="previousArticle"
          :to="previousArticle.path"
          class="navigation-card previous"
      >
        <span class="navigation-label">
          ← 上一篇
        </span>

        <strong class="navigation-title">
          {{ previousArticle.title }}
        </strong>
      </NuxtLink>

      <div
          v-else
          class="navigation-placeholder"
      />

      <NuxtLink
          v-if="nextArticle"
          :to="nextArticle.path"
          class="navigation-card next"
      >
        <span class="navigation-label">
          下一篇 →
        </span>

        <strong class="navigation-title">
          {{ nextArticle.title }}
        </strong>
      </NuxtLink>

      <div
          v-else
          class="navigation-placeholder"
      />
    </nav>

    <!-- =========================
         Footer
    ========================== -->

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
  max-width: 1100px;
  margin: 0 auto;
  padding-bottom: 100px;
}

/* =========================
   Header
========================= */

.article-header {
  max-width: 780px;
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

.article-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 12px;
  font-size: 14px;
  color: #777;
}

.category {
  padding: 4px 9px;
  border-radius: 999px;
  background: #f2f2f2;
  color: #444;
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

.article-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 20px;
}

.tag {
  padding: 5px 10px;
  border: 1px solid #e5e5e5;
  border-radius: 999px;
  background: #fafafa;
  font-size: 13px;
  color: #555;
}

/* =========================
   Layout
========================= */

.article-layout {
  display: grid;
  grid-template-columns:
    minmax(0, 780px)
    minmax(180px, 240px);
  gap: 60px;
  align-items: start;
}

/* =========================
   TOC
========================= */

.toc-title {
  margin: 0 0 16px;
  font-size: 14px;
  font-weight: 700;
  color: #222;
}

.toc-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.toc-item {
  margin: 9px 0;
}

.toc-list a {
  display: block;
  padding: 2px 0 2px 12px;
  border-left: 2px solid transparent;
  line-height: 1.5;
  color: #777;
  text-decoration: none;
  transition:
      color 0.15s ease,
      border-color 0.15s ease,
      font-weight 0.15s ease;
}

.toc-list a:hover {
  color: #111;
}

.toc-list a.active {
  border-left-color: #222;
  color: #111;
  font-weight: 700;
}

.toc-children {
  margin: 8px 0 0;
  padding-left: 14px;
  list-style: none;
}

.toc-children li {
  margin: 7px 0;
  font-size: 13px;
}

.toc-children a {
  color: #888;
}

/*
 * Sticky 必須放在 Grid Item
 */

.desktop-toc {
  position: sticky;
  top: 30px;
  align-self: start;
  margin-top: 56px;
  max-height: calc(100vh - 60px);
  overflow-y: auto;
}

.toc-sticky {
  padding-left: 20px;
  border-left: 1px solid #e5e5e5;
}

.mobile-toc {
  display: none;
}

/* =========================
   Article Content
========================= */

.article-content {
  min-width: 0;
  padding: 56px 0;
  font-size: 17px;
  line-height: 1.9;
  color: #292929;
}

.article-content :deep(h1) {
  display: none;
}

.article-content :deep(h2) {
  margin: 2.5em 0 0.8em;
  font-size: 28px;
  line-height: 1.4;
  color: #222;
  scroll-margin-top: 30px;
}

.article-content :deep(h3) {
  margin: 2em 0 0.7em;
  font-size: 22px;
  line-height: 1.5;
  color: #333;
  scroll-margin-top: 30px;
}

.article-content :deep(h2 a),
.article-content :deep(h3 a) {
  color: inherit;
  text-decoration: none;
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

/* Code Block */

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

.article-content :deep(h2 a),
.article-content :deep(h3 a) {
  color: inherit;
  text-decoration: none;
}

.article-content :deep(img) {
  max-width: 100%;
  height: auto;
  margin: 2em 0;
  border-radius: 8px;
}

.article-content :deep(hr) {
  margin: 3em 0;
  border: 0;
  border-top: 1px solid #e5e5e5;
}

/* =========================
   Previous / Next
========================= */

.article-navigation {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  max-width: 780px;
  margin-bottom: 40px;
  padding-top: 32px;
  border-top: 1px solid #e5e5e5;
}

.navigation-card {
  display: flex;
  min-height: 86px;
  box-sizing: border-box;
  padding: 18px 20px;
  flex-direction: column;
  justify-content: center;
  border: 1px solid #e1e1e1;
  border-radius: 10px;
  background: white;
  color: #222;
  text-decoration: none;
  transition:
      border-color 0.15s ease,
      background 0.15s ease,
      transform 0.15s ease;
}

.navigation-card:hover {
  border-color: #aaa;
  background: #fafafa;
  transform: translateY(-1px);
}

.navigation-card.next {
  text-align: right;
}

.navigation-label {
  margin-bottom: 7px;
  font-size: 12px;
  color: #888;
}

.navigation-title {
  font-size: 15px;
  line-height: 1.5;
  color: #333;
}

.navigation-placeholder {
  min-width: 0;
}

/* =========================
   Footer
========================= */

.article-footer {
  max-width: 780px;
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

/* =========================
   Tablet
========================= */

@media (max-width: 900px) {
  .article-page {
    max-width: 780px;
  }

  .article-header {
    max-width: none;
  }

  .article-layout {
    display: block;
  }

  .desktop-toc {
    display: none;
  }

  .mobile-toc {
    display: block;
    margin-top: 32px;
    padding: 22px 24px;
    border: 1px solid #e5e5e5;
    border-radius: 10px;
    background: #fafafa;
  }

  .article-navigation {
    max-width: none;
  }

  .article-footer {
    max-width: none;
  }
}

/* =========================
   Mobile
========================= */

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

  .mobile-toc {
    margin-top: 28px;
    padding: 20px;
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

  .article-content :deep(pre) {
    margin-left: -4px;
    margin-right: -4px;
    padding: 18px;
    font-size: 13px;
  }

  .article-navigation {
    grid-template-columns: 1fr;
  }

  .navigation-card.next {
    text-align: left;
  }

  .navigation-placeholder {
    display: none;
  }
}
</style>