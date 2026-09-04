<script setup lang="ts">
const supabase = useSupabase()
const route = useRoute()

const {
  user,
} = useAuth()

const mode = ref<'login' | 'register'>('login')

const email = ref('')
const password = ref('')

const loading = ref(false)
const message = ref('')
const errorMessage = ref('')

function getRedirectPath() {
  const redirect = route.query.redirect

  if (typeof redirect !== 'string') {
    return '/'
  }

  // 只允許站內路徑，避免 Open Redirect
  if (!redirect.startsWith('/') || redirect.startsWith('//')) {
    return '/'
  }

  return redirect
}

async function signIn() {
  loading.value = true
  message.value = ''
  errorMessage.value = ''

  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.value,
      password: password.value,
    })

    if (error) {
      errorMessage.value = error.message
      return
    }

    message.value = '登入成功'

    await navigateTo(getRedirectPath())
  } catch (error) {
    console.error(error)
    errorMessage.value = '登入時發生錯誤'
  } finally {
    loading.value = false
  }
}

async function signUp() {
  loading.value = true
  message.value = ''
  errorMessage.value = ''

  try {
    const { data, error } = await supabase.auth.signUp({
      email: email.value,
      password: password.value,
    })

    if (error) {
      errorMessage.value = error.message
      return
    }

    if (data.session) {
      message.value = '註冊成功，已登入'

      await navigateTo(getRedirectPath())
    } else {
      message.value = '註冊成功，請到信箱完成驗證'
    }
  } catch (error) {
    console.error(error)
    errorMessage.value = '註冊時發生錯誤'
  } finally {
    loading.value = false
  }
}

async function signOut() {
  const { error } = await supabase.auth.signOut()

  if (error) {
    errorMessage.value = error.message
  }
}

function switchMode(newMode: 'login' | 'register') {
  mode.value = newMode
  message.value = ''
  errorMessage.value = ''
}
</script>

<template>
  <div class="auth-page">
    <div class="auth-card">
      <template v-if="user">
        <h1>會員帳號</h1>

        <p class="logged-in-text">
          目前登入帳號
        </p>

        <p class="email">
          {{ user.email }}
        </p>

        <button
            type="button"
            class="primary-button"
            @click="signOut"
        >
          登出
        </button>
      </template>

      <template v-else>
        <h1>
          {{ mode === 'login' ? '登入' : '建立帳號' }}
        </h1>

        <p class="subtitle">
          {{
            mode === 'login'
                ? '登入後即可使用會員功能'
                : '建立帳號後即可使用會員功能'
          }}
        </p>

        <div class="mode-tabs">
          <button
              type="button"
              class="mode-button"
              :class="{ active: mode === 'login' }"
              @click="switchMode('login')"
          >
            登入
          </button>

          <button
              type="button"
              class="mode-button"
              :class="{ active: mode === 'register' }"
              @click="switchMode('register')"
          >
            註冊
          </button>
        </div>

        <form
            class="auth-form"
            @submit.prevent="mode === 'login' ? signIn() : signUp()"
        >
          <label>
            Email

            <input
                v-model="email"
                type="email"
                autocomplete="email"
                required
            >
          </label>

          <label>
            密碼

            <input
                v-model="password"
                type="password"
                :autocomplete="
                mode === 'login'
                  ? 'current-password'
                  : 'new-password'
              "
                minlength="6"
                required
            >
          </label>

          <button
              type="submit"
              class="primary-button"
              :disabled="loading"
          >
            {{
              loading
                  ? '處理中...'
                  : mode === 'login'
                      ? '登入'
                      : '註冊'
            }}
          </button>
        </form>

        <p
            v-if="message"
            class="message"
        >
          {{ message }}
        </p>

        <p
            v-if="errorMessage"
            class="error-message"
        >
          {{ errorMessage }}
        </p>
      </template>
    </div>
  </div>
</template>

<style scoped>
.auth-page {
  display: flex;
  justify-content: center;
  padding: 40px 0;
}

.auth-card {
  width: 100%;
  max-width: 420px;

  padding: 32px;

  border: 1px solid #e5e5e5;
  border-radius: 12px;
  background: white;
}

h1 {
  margin: 0 0 8px;

  font-size: 28px;
}

.subtitle {
  margin: 0 0 24px;
  color: #666;
}

.mode-tabs {
  display: flex;

  margin-bottom: 24px;

  border-bottom: 1px solid #e5e5e5;
}

.mode-button {
  flex: 1;

  padding: 12px;

  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;

  font: inherit;
  color: #777;

  cursor: pointer;
}

.mode-button.active {
  border-bottom-color: #111;
  color: #111;
  font-weight: 700;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.auth-form label {
  display: flex;
  flex-direction: column;
  gap: 8px;

  font-weight: 600;
}

.auth-form input {
  padding: 12px 14px;

  border: 1px solid #ccc;
  border-radius: 8px;

  font: inherit;
}

.auth-form input:focus {
  outline: 2px solid #222;
  outline-offset: 1px;
}

.primary-button {
  padding: 12px 16px;

  border: 0;
  border-radius: 8px;
  background: #222;

  font: inherit;
  font-weight: 700;
  color: white;

  cursor: pointer;
}

.primary-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.logged-in-text {
  margin-bottom: 4px;
  color: #666;
}

.email {
  margin-top: 0;
  margin-bottom: 24px;

  font-weight: 700;
}

.message {
  margin-top: 20px;
  color: #166534;
}

.error-message {
  margin-top: 20px;
  color: #b91c1c;
}

@media (max-width: 600px) {
  .auth-page {
    padding: 16px 0;
  }

  .auth-card {
    padding: 24px 20px;

    border: 0;
  }
}
</style>