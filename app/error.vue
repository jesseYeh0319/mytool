<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{
  error: NuxtError
}>()

const is404 = computed(() => {
  return props.error.statusCode === 404
})

useSeoMeta({
  title: () =>
      is404.value
          ? '找不到頁面 | MYBB'
          : '發生錯誤 | MYBB',

  robots: 'noindex'
})

function goHome() {
  clearError({
    redirect: '/'
  })
}
</script>

<template>
  <div class="error-page">
    <header class="site-header">
      <div class="nav-container">
        <button
            type="button"
            class="brand"
            @click="goHome"
        >
          MYBB
        </button>
      </div>
    </header>

    <main class="error-content">
      <p class="error-code">
        {{ error.statusCode }}
      </p>

      <h1>
        {{ is404 ? '找不到這個頁面' : '發生了一些問題' }}
      </h1>

      <p class="error-description">
        <template v-if="is404">
          你要找的頁面可能不存在、已經移動，
          或網址輸入錯誤。
        </template>

        <template v-else>
          網站目前無法正常顯示這個頁面。
        </template>
      </p>

      <div class="actions">
        <button
            type="button"
            class="primary-button"
            @click="goHome"
        >
          回到首頁
        </button>

        <a
            href="/tech"
            class="secondary-button"
        >
          技術紀錄
        </a>
      </div>
    </main>
  </div>
</template>

<style scoped>
.error-page {
  min-height: 100vh;
  background: white;
  color: #222;
}

.site-header {
  border-bottom: 1px solid #e5e5e5;
}

.nav-container {
  max-width: 1000px;
  margin: 0 auto;
  padding: 20px;
}

.brand {
  padding: 0;
  border: 0;
  background: transparent;
  font: inherit;
  font-size: 24px;
  font-weight: 700;
  color: #222;
  cursor: pointer;
}

.error-content {
  display: flex;
  max-width: 720px;
  min-height: calc(100vh - 90px);
  box-sizing: border-box;
  margin: 0 auto;
  padding: 80px 20px 140px;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
}

.error-code {
  margin: 0 0 12px;
  font-size: 80px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.04em;
  color: #222;
}

.error-content h1 {
  margin: 0;
  font-size: 36px;
  line-height: 1.3;
}

.error-description {
  max-width: 520px;
  margin: 20px 0 0;
  font-size: 17px;
  line-height: 1.8;
  color: #666;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 32px;
}

.primary-button,
.secondary-button {
  display: inline-flex;
  box-sizing: border-box;
  padding: 11px 18px;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
}

.primary-button {
  border: 1px solid #222;
  background: #222;
  color: white;
}

.primary-button:hover {
  background: #444;
}

.secondary-button {
  border: 1px solid #ddd;
  background: white;
  color: #222;
}

.secondary-button:hover {
  background: #f5f5f5;
}

@media (max-width: 768px) {
  .nav-container {
    padding: 16px 20px;
  }

  .error-content {
    min-height: calc(100vh - 70px);
    padding-top: 60px;
    padding-bottom: 100px;
  }

  .error-code {
    font-size: 64px;
  }

  .error-content h1 {
    font-size: 30px;
  }

  .error-description {
    font-size: 16px;
  }
}
</style>