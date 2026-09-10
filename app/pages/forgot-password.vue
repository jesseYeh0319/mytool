<script setup lang="ts">
const supabase = useSupabase()

const email = ref('')
const loading = ref(false)
const sent = ref(false)
const errorMessage = ref('')

useHead({
  title: '忘記密碼｜MYBB',
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})

async function sendResetEmail() {
  if (loading.value || sent.value) return

  loading.value = true
  errorMessage.value = ''

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(
        email.value.trim(),
        {
          redirectTo: `${window.location.origin}/reset-password`,
        },
    )

    if (error) {
      errorMessage.value = error.status === 429
          ? '寄信次數過於頻繁，請稍後再試。'
          : '目前無法寄出重設密碼信，請稍後再試或聯絡客服。'
      return
    }

    sent.value = true
  } catch {
    errorMessage.value = '連線失敗，請確認網路後再試。'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section class="recovery-page">
    <h1>忘記密碼</h1>

    <p v-if="sent" role="status">
      如果此信箱已註冊，我們會寄出重設密碼信。
      請檢查收件匣與垃圾郵件。
    </p>

    <form v-else @submit.prevent="sendResetEmail">
      <p>輸入註冊信箱，我們會寄送重設密碼連結。</p>

      <label for="recovery-email">Email</label>
      <input
          id="recovery-email"
          v-model="email"
          type="email"
          autocomplete="email"
          required
          :disabled="loading"
      >

      <button type="submit" :disabled="loading">
        {{ loading ? '寄送中…' : '寄送重設密碼信' }}
      </button>
    </form>

    <p v-if="errorMessage" class="error" role="alert">
      {{ errorMessage }}
    </p>

    <NuxtLink to="/login">返回登入</NuxtLink>
  </section>
</template>

<style scoped>
.recovery-page {
  max-width: 420px;
  margin: 32px auto;
  padding: 24px;
  border: 1px solid #ddd;
  border-radius: 12px;
}
form { display: grid; gap: 12px; margin-bottom: 20px; }
input, button {
  box-sizing: border-box;
  width: 100%;
  padding: 12px;
  border: 1px solid #ccc;
  border-radius: 6px;
  font: inherit;
}
button { background: #222; color: white; cursor: pointer; }
button:disabled { opacity: 0.6; cursor: not-allowed; }
.error { color: #b91c1c; }
</style>