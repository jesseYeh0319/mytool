<script setup lang="ts">
useSeoMeta({
  title: '關於 | MYBB',

  description:
      '關於 MYBB：軟體開發、技術學習、個人專案與小說創作。',

  ogTitle: '關於 | MYBB',

  ogDescription:
      '關於 MYBB：軟體開發、技術學習、個人專案與小說創作。'
})
</script>

<template>
  <section class="about-page">
    <header class="page-header">
      <p class="page-label">
        ABOUT
      </p>

      <h1>
        關於這個網站
      </h1>

      <p class="page-description">
        這裡記錄我的軟體開發實務、技術學習、個人專案，
        以及小說創作。
      </p>
    </header>

    <div class="about-content">
      <section class="about-section">
        <h2>
          關於我
        </h2>

        <p>
          我是一名軟體工程師，主要使用 Java 與 Spring
          相關技術進行後端與企業系統開發。
        </p>

        <p>
          除了日常開發工作之外，我也持續研究前端、
          DevOps、Cloud、AI，以及如何建立自己的產品。
        </p>
      </section>

      <section class="about-section">
        <h2>
          技術方向
        </h2>

        <div class="skill-list">
          <span class="skill">
            Java
          </span>

          <span class="skill">
            Spring Boot
          </span>

          <span class="skill">
            Vue
          </span>

          <span class="skill">
            Nuxt
          </span>

          <span class="skill">
            Docker
          </span>

          <span class="skill">
            Kubernetes
          </span>

          <span class="skill">
            DevOps
          </span>

          <span class="skill">
            AWS
          </span>

          <span class="skill">
            AI
          </span>
        </div>
      </section>

      <section class="about-section">
        <h2>
          為什麼建立這個網站
        </h2>

        <p>
          很多技術問題，如果只是在工作中解決一次，
          過一段時間很容易忘記當時踩過的坑。
        </p>

        <p>
          所以我希望把實際遇到的問題、解法、學習過程，
          整理成可以長期累積的技術紀錄。
        </p>

        <p>
          這個網站同時也是我的個人實驗場，
          用來實際練習網站開發、部署、SEO、
          內容經營，以及未來可能發展的產品功能。
        </p>
      </section>

      <section class="about-section">
        <h2>
          技術紀錄
        </h2>

        <p>
          技術文章會以實際開發經驗為主，
          包含 Java、Spring Boot、Vue、Nuxt、
          DevOps、Cloud 與其他軟體工程相關內容。
        </p>

        <NuxtLink
            to="/tech"
            class="section-link"
        >
          查看技術紀錄 →
        </NuxtLink>
      </section>

      <section class="about-section">
        <h2>
          小說創作
        </h2>

        <p>
          除了技術內容之外，我也會在這裡放自己的小說作品。
        </p>

        <p>
          目前小說系統仍在持續開發，
          未來會逐步加入更完整的閱讀與作品功能。
        </p>

        <NuxtLink
            to="/novels"
            class="section-link"
        >
          查看小說作品 →
        </NuxtLink>
      </section>

      <section class="about-section">
        <h2>
          這個網站本身
        </h2>

        <p>
          本站目前使用 Nuxt、Vue 與 Nuxt Content 建立，
          並透過 GitHub 管理版本。
        </p>

        <div class="architecture">
          <span>
            Markdown
          </span>

          <span class="arrow">
            →
          </span>

          <span>
            Nuxt Content
          </span>

          <span class="arrow">
            →
          </span>

          <span>
            Nuxt
          </span>

          <span class="arrow">
            →
          </span>

          <span>
            Vercel
          </span>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.about-page {
  max-width: 820px;
  margin: 0 auto;
  padding-bottom: 100px;
}

/* =========================
   Header
========================= */

.page-header {
  padding: 40px 0 48px;
  border-bottom: 1px solid #e5e5e5;
}

.page-label {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.14em;
  color: #777;
}

.page-header h1 {
  margin: 0;
  font-size: 42px;
  line-height: 1.25;
  color: #1f1f1f;
}

.page-description {
  max-width: 680px;
  margin: 18px 0 0;
  font-size: 18px;
  line-height: 1.8;
  color: #666;
}

/* =========================
   Content
========================= */

.about-content {
  padding-top: 16px;
}

.about-section {
  padding: 40px 0;
  border-bottom: 1px solid #e5e5e5;
}

.about-section:last-child {
  border-bottom: 0;
}

.about-section h2 {
  margin: 0 0 18px;
  font-size: 26px;
  line-height: 1.4;
  color: #222;
}

.about-section p {
  margin: 0 0 16px;
  font-size: 16px;
  line-height: 1.9;
  color: #555;
}

.about-section p:last-of-type {
  margin-bottom: 0;
}

/* =========================
   Skills
========================= */

.skill-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.skill {
  padding: 7px 12px;
  border: 1px solid #e1e1e1;
  border-radius: 999px;
  background: #fafafa;
  font-size: 14px;
  color: #555;
}

/* =========================
   Links
========================= */

.section-link {
  display: inline-block;
  margin-top: 20px;
  font-size: 14px;
  font-weight: 600;
  color: #222;
  text-decoration: none;
}

.section-link:hover {
  text-decoration: underline;
  text-underline-offset: 4px;
}

/* =========================
   Architecture
========================= */

.architecture {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 22px;
  padding: 18px 20px;
  border: 1px solid #e5e5e5;
  border-radius: 10px;
  background: #fafafa;
  font-size: 14px;
  color: #444;
}

.arrow {
  color: #999;
}

/* =========================
   Mobile
========================= */

@media (max-width: 768px) {
  .page-header {
    padding: 24px 0 36px;
  }

  .page-header h1 {
    font-size: 34px;
  }

  .page-description {
    font-size: 16px;
  }

  .about-section {
    padding: 32px 0;
  }

  .about-section h2 {
    font-size: 23px;
  }

  .architecture {
    align-items: flex-start;
  }
}
</style>