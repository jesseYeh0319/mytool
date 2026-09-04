<script setup lang="ts">
import { ref } from 'vue'

const menuOpen = ref(false)

const {
  user,
  initialized,
} = useAuth()

const supabase = useSupabase()

function closeMenu() {
  menuOpen.value = false
}

async function signOut() {
  const { error } = await supabase.auth.signOut()

  if (error) {
    console.error('登出失敗:', error)
    return
  }

  closeMenu()
}
</script>

<template>
  <div>
    <header class="site-header">
      <nav class="nav-container">
        <NuxtLink class="brand" to="/" @click="closeMenu">
          MYBB
        </NuxtLink>

        <!-- 手機版選單按鈕 -->
        <button
            class="menu-button"
            type="button"
            aria-label="開啟導覽選單"
            @click="menuOpen = !menuOpen"
        >
          ☰
        </button>

        <!-- 導覽連結 -->
        <div
            class="nav-links"
            :class="{ open: menuOpen }"
        >
          <NuxtLink to="/" @click="closeMenu">
            首頁
          </NuxtLink>

          <NuxtLink to="/tech" @click="closeMenu">
            技術紀錄
          </NuxtLink>

          <NuxtLink to="/novels" @click="closeMenu">
            小說
          </NuxtLink>

          <NuxtLink to="/about" @click="closeMenu">
            關於
          </NuxtLink>

          <template v-if="initialized">
            <template v-if="user">
              <span class="auth-email">
                {{ user.email }}
              </span>

              <button
                  type="button"
                  class="auth-button"
                  @click="signOut"
              >
                登出
              </button>
            </template>

            <NuxtLink
                v-else
                to="/login"
                @click="closeMenu"
            >
              登入
            </NuxtLink>
          </template>
        </div>
      </nav>
    </header>

    <main class="page-container">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.site-header {
  border-bottom: 1px solid #e5e5e5;
  background: white;
}

.nav-container {
  position: relative;

  max-width: 1000px;
  margin: 0 auto;
  padding: 20px;

  display: flex;
  align-items: center;
  justify-content: space-between;
}

.brand {
  font-size: 24px;
  font-weight: 700;
  text-decoration: none;
  color: #222;
}

.nav-links {
  display: flex;
  align-items: center;
  gap: 24px;
}

.nav-links a {
  padding-bottom: 4px;
  text-decoration: none;
  color: #444;
}

.nav-links a:hover {
  color: #111;
}

.nav-links a.router-link-exact-active {
  font-weight: 700;
  color: #111;
  border-bottom: 2px solid #111;
}

.auth-email {
  font-size: 14px;
  color: #666;
}

.auth-button {
  padding: 0;
  border: 0;
  background: transparent;

  font: inherit;
  color: #444;

  cursor: pointer;
}

.auth-button:hover {
  color: #111;
}

/* 桌機不顯示漢堡按鈕 */
.menu-button {
  display: none;

  border: 0;
  background: transparent;

  font-size: 28px;
  line-height: 1;

  cursor: pointer;
}

.page-container {
  max-width: 1000px;
  margin: 0 auto;
  padding: 40px 20px;
}

/* 手機版 */
@media (max-width: 768px) {
  .nav-container {
    padding: 16px 20px;
  }

  .menu-button {
    display: block;
  }

  .nav-links {
    display: none;

    position: absolute;
    top: 100%;
    left: 0;
    right: 0;

    padding: 16px 20px;

    flex-direction: column;
    align-items: flex-start;
    gap: 16px;

    background: white;
    border-bottom: 1px solid #e5e5e5;
  }

  .nav-links.open {
    display: flex;
  }

  .nav-links a {
    width: 100%;
  }

  .auth-email {
    width: 100%;
  }

  .auth-button {
    width: 100%;
    text-align: left;
  }

  .page-container {
    padding: 24px 20px;
  }
}
</style>