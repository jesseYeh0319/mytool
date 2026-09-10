<script setup lang="ts">
const supabase = useSupabase()
const router = useRouter()

const password = ref('')
const confirmPassword = ref('')
const ready = ref(false)
const loading = ref(false)
const done = ref(false)
const errorMessage = ref('')

const recoveryUserId = useState<string | null>(
    'password-recovery-user-id',
    () => null,
)

let pageDisposed = false

useHead({
  title: '重設密碼｜MYBB',
  meta: [
    { name: 'robots', content: 'noindex, nofollow' },
    { name: 'referrer', content: 'no-referrer' },
  ],
})

onMounted(async () => {
  try {
    // 預設郵件連結由 Supabase 自動驗證。
    const { error } = await supabase.auth.initialize()

    // 等待 SDK 發出 PASSWORD_RECOVERY 事件。
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0)
    })

    if (pageDisposed) return

    if (error || !recoveryUserId.value) {
      errorMessage.value =
          '重設連結無效、已使用或已過期，請重新申請重設密碼信。'
      return
    }

    ready.value = true
    errorMessage.value = ''
  } catch {
    if (pageDisposed) return

    errorMessage.value =
        '目前無法驗證重設連結，請確認網路後重新申請。'
  } finally {
    // 驗證完成後，清除網址中的驗證資料。
    if (!pageDisposed) {
      await router.replace({ path: '/reset-password' })
    }
  }
})

watch(recoveryUserId, (currentId, previousId) => {
  if (
      !done.value &&
      previousId &&
      currentId !== previousId
  ) {
    ready.value = false
    password.value = ''
    confirmPassword.value = ''
    errorMessage.value =
        '登入狀態已變更，請重新申請重設密碼信。'
  }
})

onBeforeUnmount(() => {
  pageDisposed = true
  recoveryUserId.value = null
})

async function savePassword() {
  if (loading.value || !ready.value || done.value) return

  errorMessage.value = ''

  if (password.value.length < 8) {
    errorMessage.value = '新密碼至少需要 8 個字元。'
    return
  }

  if (password.value !== confirmPassword.value) {
    errorMessage.value = '兩次輸入的密碼不一致。'
    return
  }

  const targetUserId = recoveryUserId.value

  if (!targetUserId) {
    ready.value = false
    errorMessage.value =
        '重設授權已失效，請重新申請重設密碼信。'
    return
  }

  loading.value = true

  try {
    // 確認目前登入的仍是申請重設密碼的帳號。
    const { data: current, error: userError } =
        await supabase.auth.getUser()

    if (pageDisposed) return

    if (
        userError ||
        current.user?.id !== targetUserId ||
        recoveryUserId.value !== targetUserId
    ) {
      ready.value = false
      errorMessage.value =
          '登入狀態已變更，請重新申請重設密碼信。'
      return
    }

    const { error } = await supabase.auth.updateUser({
      password: password.value,
    })

    if (pageDisposed) return

    if (error) {
      errorMessage.value =
          error.code === 'same_password'
              ? '新密碼不能與原本的密碼相同。'
              : error.code === 'weak_password'
                  ? '密碼不符合安全要求，請使用更長、更不容易猜到的密碼。'
                  : '目前無法更新密碼，請稍後再試；若持續失敗，請重新申請重設信。'
      return
    }

    done.value = true
    ready.value = false
    password.value = ''
    confirmPassword.value = ''
    recoveryUserId.value = null
  } catch {
    if (pageDisposed) return
    errorMessage.value = '連線失敗，請確認網路後再試。'
  } finally {
    loading.value = false
  }
}

async function returnToLogin() {
  if (loading.value) return

  loading.value = true
  errorMessage.value = ''

  try {
    const { error } = await supabase.auth.signOut({
      scope: 'local',
    })

    if (error) {
      errorMessage.value =
          '密碼已更新，但登出未完成，請再按一次返回登入。'
      return
    }

    await navigateTo('/login')
  } catch {
    errorMessage.value =
        '密碼已更新，但目前無法返回登入，請稍後再試。'
  } finally {
    loading.value = false
  }
}
</script>
<template>
  <section class="recovery-page">
    <h1>重設密碼</h1>

    <template v-if="done">
      <p role="status">密碼已更新，請使用新密碼重新登入。</p>
      <button
          type="button"
          :disabled="loading"
          @click="returnToLogin"
      >
        {{ loading ? '處理中…' : '返回登入' }}
      </button>
    </template>

    <form v-else-if="ready" @submit.prevent="savePassword">
      <label for="new-password">新密碼</label>
      <input
          id="new-password"
          v-model="password"
          type="password"
          autocomplete="new-password"
          minlength="8"
          required
          :disabled="loading"
      >

      <label for="confirm-password">再次輸入新密碼</label>
      <input
          id="confirm-password"
          v-model="confirmPassword"
          type="password"
          autocomplete="new-password"
          minlength="8"
          required
          :disabled="loading"
      >

      <button type="submit" :disabled="loading">
        {{ loading ? '驗證與更新中…' : '更新密碼' }}
      </button>
    </form>

    <p v-else-if="!errorMessage" role="status">
      正在讀取重設連結…
    </p>

    <p v-if="errorMessage" class="error" role="alert">
      {{ errorMessage }}
    </p>

    <p v-if="!done">
      <NuxtLink to="/forgot-password">重新申請重設密碼信</NuxtLink>
    </p>
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