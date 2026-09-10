<script setup lang="ts">
import { ref } from 'vue'

const menuOpen = ref(false)

const {
  user,
  initialized,
} = useAuth()

const supabase = useSupabase()
const route = useRoute()

function closeMenu() {
  menuOpen.value = false
}

// 換頁後收合選單，避免手機上蓋住新頁面的內容。
watch(() => route.fullPath, closeMenu)

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
            :aria-label="menuOpen ? '關閉導覽選單' : '開啟導覽選單'"
            :aria-expanded="menuOpen"
            aria-controls="site-nav-links"
            @click="menuOpen = !menuOpen"
        >
          <span aria-hidden="true">
            {{ menuOpen ? '✕' : '☰' }}
          </span>
        </button>

        <!-- 導覽連結 -->
        <div
            id="site-nav-links"
            class="nav-links"
            :class="{ open: menuOpen }"
            @keydown.esc="closeMenu"
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
              <NuxtLink
                  to="/account"
                  @click="closeMenu"
              >
                會員中心
              </NuxtLink>
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
    <footer class="site-footer">
      <div class="footer-container">
        <div>
          <strong>MYBB 數位閱讀</strong>

          <p>
            原創小說與技術內容閱讀平台
          </p>
        </div>

        <nav
            class="footer-links"
            aria-label="網站政策"
        >
          <NuxtLink to="/terms">
            服務條款
          </NuxtLink>

          <NuxtLink to="/privacy">
            隱私權政策
          </NuxtLink>

          <NuxtLink to="/refund">
            退款政策
          </NuxtLink>

          <a href="mailto:yehweiyang@gmail.com">
            聯絡客服
          </a>
        </nav>
      </div>

      <p class="copyright">
        © 2026 MYBB. All rights reserved.
      </p>
    </footer>
  </div>
</template>

<style scoped>
.site-header {
  position: sticky;
  top: 0;
  z-index: 1000;

  border-bottom: 1px solid #e5e5e5;

  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(10px);
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
  min-width: 0;
  max-width: 200px;

  font-size: 14px;
  color: #666;

  /* 長信箱在桌機截斷，不要把導覽列撐開。 */
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
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

  /* 44px 是觸控目標的最小建議尺寸。 */
  min-width: 44px;
  min-height: 44px;

  align-items: center;
  justify-content: center;

  margin-right: -10px;
  padding: 0;

  border: 0;
  background: transparent;
  color: inherit;

  font-size: 26px;
  line-height: 1;

  cursor: pointer;
}

.page-container {
  max-width: 1000px;
  margin: 0 auto;
  padding: 40px 20px;
}

.site-footer {
  margin-top: 80px;

  border-top: 1px solid #e5e5e5;

  background: #fafafa;
}

.footer-container {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 32px;

  max-width: 1000px;
  margin: 0 auto;
  padding: 36px 20px 28px;
}

.footer-container strong {
  font-size: 18px;
}

.footer-container p {
  margin: 8px 0 0;

  color: #666;
}

.footer-links {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 12px 20px;
}

.footer-links a {
  color: #444;
  text-decoration: none;
}

.footer-links a:hover {
  text-decoration: underline;
}

.copyright {
  max-width: 1000px;
  margin: 0 auto;
  padding: 20px;

  border-top: 1px solid #e5e5e5;

  font-size: 13px;
  color: #777;
}

/* 手機版 */
@media (max-width: 768px) {

  .footer-container {
    flex-direction: column;
  }

  .footer-links {
    flex-direction: column;
    justify-content: flex-start;
  }
  
  .nav-container {
    padding: 16px 20px;
  }

  .menu-button {
    display: inline-flex;
  }

  .nav-links {
    display: none;

    position: absolute;
    top: 100%;
    left: 0;
    right: 0;

    padding: 8px 20px 16px;

    flex-direction: column;
    align-items: stretch;
    gap: 0;

    background: white;
    border-bottom: 1px solid #e5e5e5;

    /*
     * 選單比視窗高時自己捲動，
     * 而不是把項目推到畫面外。
     */
    max-height: calc(100dvh - 100%);
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .nav-links.open {
    display: flex;
  }

  /* 手機上每個項目都撐成一整列，方便單手點擊。 */
  .nav-links a,
  .auth-button {
    display: flex;
    align-items: center;

    width: 100%;
    min-height: 48px;

    padding: 0;

    border-bottom: 1px solid #f0f0f0;
  }

  .nav-links a.router-link-exact-active {
    border-bottom-color: #111;
  }

  .auth-button {
    justify-content: flex-start;
    text-align: left;
  }

  /*
   * 帳號資訊不是可點擊項目，
   * 縮小並改為換行，跟連結區隔開。
   */
  .auth-email {
    width: 100%;
    max-width: 100%;

    padding: 10px 0 4px;

    font-size: 13px;

    white-space: normal;
    overflow: visible;
    overflow-wrap: anywhere;
  }

  .page-container {
    padding: 24px 20px;
  }
}
</style>