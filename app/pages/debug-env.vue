<script setup lang="ts">
/*
 * 除錯用頁面：/debug-env
 * 確認完 Vercel 上的環境變數有沒有正確寫入後，
 * 記得把這個檔案跟對應的 server/api/debug/env-check.get.ts 一起刪掉。
 */
const clientConfig = useRuntimeConfig()

const { data, error, pending } = await useFetch('/api/debug/env-check')

onMounted(() => {
  console.log(
      '[env-check] 瀏覽器讀到的 public runtimeConfig：',
      clientConfig.public,
  )
  console.log('[env-check] 伺服器回傳的檢查結果：', data.value)

  if (error.value) {
    console.error('[env-check] 呼叫 /api/debug/env-check 失敗：', error.value)
  }
})
</script>

<template>
  <main style="max-width: 720px; margin: 40px auto; padding: 0 16px; font-family: monospace;">
    <h1 style="font-size: 18px;">環境變數檢查</h1>

    <p style="font-size: 13px; color: #a4262c;">
      這是除錯用頁面，確認完畢後請刪除這個檔案跟對應的 API，不要留在正式站上。
    </p>

    <p v-if="pending">讀取中…</p>

    <template v-else>
      <h2 style="font-size: 15px; margin-top: 24px;">瀏覽器端讀到的 public 設定</h2>
      <pre style="background:#f3f4f6; padding:12px; border-radius:6px; overflow:auto;">{{ JSON.stringify(clientConfig.public, null, 2) }}</pre>

      <h2 style="font-size: 15px; margin-top: 24px;">伺服器端檢查結果</h2>
      <pre style="background:#f3f4f6; padding:12px; border-radius:6px; overflow:auto;">{{ JSON.stringify(data, null, 2) }}</pre>

      <p v-if="error" style="color:#a4262c;">
        呼叫 API 失敗：{{ error.message }}
      </p>
    </template>

    <p style="font-size: 12.5px; color: #666; margin-top: 24px;">
      同樣的內容也印在瀏覽器 console（F12 → Console）裡。
    </p>
  </main>
</template>
