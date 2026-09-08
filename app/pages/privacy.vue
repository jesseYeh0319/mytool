<script setup lang="ts">
useSeoMeta({
  title: '隱私權政策｜MYBB',
  description: 'MYBB 個人資料蒐集、處理及利用說明。',
})
</script>

<template>
  <article class="policy-page">
    <h1>隱私權政策</h1>

    <p class="updated-at">
      最後更新日期：2026 年 9 月 8 日
    </p>

    <section>
      <h2>一、適用範圍</h2>

      <p>
        本隱私權政策適用於使用者瀏覽及使用 MYBB 網站、
        註冊會員、閱讀內容與購買數位內容時，MYBB 對個人資料的
        蒐集、處理及利用。
      </p>
    </section>

    <section>
      <h2>二、蒐集的資料</h2>

      <p>依使用功能不同，我們可能蒐集下列資料：</p>

      <ul>
        <li>會員資料，例如電子郵件地址及系統產生的會員識別碼。</li>
        <li>訂單資料，例如訂單編號、購買內容、金額及付款狀態。</li>
        <li>閱讀資料，例如最近閱讀章節、閱讀進度及更新時間。</li>
        <li>技術資料，例如 IP 位址、瀏覽器類型、裝置資訊及系統紀錄。</li>
        <li>使用者主動提供給客服的聯絡內容。</li>
      </ul>

      <p>
        信用卡卡號、有效期限及安全碼將由合作的第三方支付服務商處理，
        MYBB 不會直接保存完整信用卡資料。
      </p>
    </section>

    <section>
      <h2>三、資料使用目的</h2>

      <ul>
        <li>建立、驗證及維護會員帳號。</li>
        <li>保存及同步閱讀進度。</li>
        <li>建立訂單、確認付款及提供付費內容閱讀權限。</li>
        <li>提供客服、退款及交易爭議處理。</li>
        <li>維護網站安全、排除故障及防止不當使用。</li>
        <li>履行法令、稅務及會計要求。</li>
      </ul>
    </section>

    <section>
      <h2>四、第三方服務</h2>

      <p>
        為提供網站功能，我們可能將必要資料交由以下服務商處理：
      </p>

      <ul>
        <li>Supabase：會員驗證、資料庫及閱讀權限管理。</li>
        <li>Vercel：網站託管、內容傳輸及系統紀錄。</li>
        <li>藍新金流：付款處理、交易確認及退款作業。</li>
      </ul>

      <p>
        上述服務商僅在提供服務所需範圍內處理資料，
        並受其各自的隱私權政策及安全措施規範。
      </p>
    </section>

    <section>
      <h2>五、瀏覽器儲存技術</h2>

      <p>
        本網站使用 localStorage 保存閱讀模式、字體大小及閱讀進度，
        讓使用者重新開啟網站時可以延續先前設定。
      </p>

      <p>
        使用者可以透過瀏覽器設定清除這些資料；
        清除後，尚未同步至會員帳號的本機閱讀設定及進度可能無法恢復。
      </p>
    </section>

    <section>
      <h2>六、資料保存期間</h2>

      <p>
        個人資料將於提供服務、履行交易、處理爭議及遵守法令所需期間內保存。
        當蒐集目的消失或保存期限屆滿後，我們將依法刪除、
        停止處理或進行去識別化。
      </p>
    </section>

    <section>
      <h2>七、資料安全</h2>

      <p>
        我們採取合理的技術及管理措施保護個人資料，
        包括身分驗證、資料存取權限控制及加密連線。
        然而，網際網路傳輸無法保證絕對安全，
        使用者亦應妥善保管帳號及登入資訊。
      </p>
    </section>

    <section>
      <h2>八、使用者權利</h2>

      <p>
        使用者得依法就其個人資料提出查詢、閱覽、製給複製本、
        補充、更正、停止蒐集、停止處理、停止利用或刪除等要求。
      </p>

      <p>
        若要求刪除履行交易或法令所必須保存的資料，
        我們可能於必要保存期間屆滿後再行刪除。
      </p>
    </section>

    <section>
      <h2>九、兒童及未成年人</h2>

      <p>
        未成年人使用本網站或購買付費內容前，
        應取得法定代理人的同意。
      </p>
    </section>

    <section>
      <h2>十、政策修改</h2>

      <p>
        本政策可能因服務調整或法令變更而更新。
        更新後的內容及日期將公布於本頁面。
      </p>
    </section>

    <section>
      <h2>十一、聯絡方式</h2>

      <p>
        如對個人資料處理或本政策有任何問題，請聯絡：
      </p>

      <p>
        客服信箱：
        <a href="mailto:yehweiyang@gmail.com">
          yehweiyang@gmail.com
        </a>
      </p>
    </section>
  </article>
</template>

<style scoped>
.policy-page {
  max-width: 760px;
  margin: 0 auto;
  padding-bottom: 80px;
}

.policy-page h1 {
  margin: 0 0 12px;
  font-size: 36px;
}

.updated-at {
  margin-bottom: 40px;
  color: #777;
}

.policy-page section {
  margin-top: 36px;
}

.policy-page h2 {
  margin-bottom: 12px;
  font-size: 22px;
}

.policy-page p,
.policy-page li {
  line-height: 1.8;
  color: #444;
}

.policy-page ul {
  padding-left: 24px;
}

.policy-page a {
  color: inherit;
}

@media (max-width: 768px) {
  .policy-page h1 {
    font-size: 30px;
  }
}
</style>