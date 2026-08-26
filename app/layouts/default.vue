<template>
  <div>
    <header class="site-header">
      <nav class="nav-container">
        <NuxtLink class="brand" to="/">
          MYBB
        </NuxtLink>

        <div class="nav-links">
          <NuxtLink to="/">首頁</NuxtLink>
          <NuxtLink to="/tech">技術紀錄</NuxtLink>
          <NuxtLink to="/novels">小說</NuxtLink>
          <NuxtLink to="/about">關於</NuxtLink>
        </div>
      </nav>
    </header>

    <main class="page-container">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.nav-links a.router-link-exact-active {
  font-weight: 700;
  color: #111;
  border-bottom: 2px solid #111;
}
.site-header {
  border-bottom: 1px solid #e5e5e5;
}

.nav-container {
  max-width: 1000px;
  margin: 0 auto;
  padding: 20px;

  display: flex;
  align-items: center;
  justify-content: space-between;
}

.brand {
  font-size: 24px;
  font-weight: bold;
  text-decoration: none;
  color: #222;
}

.nav-links {
  display: flex;
  gap: 24px;
}

.nav-links a {
  text-decoration: none;
  color: #444;
}

.page-container {
  max-width: 1000px;
  margin: 0 auto;
  padding: 40px 20px;
}
</style>