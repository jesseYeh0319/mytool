<script setup lang="ts">
useSeoMeta({
  title: '退款政策｜MYBB',
  description: 'MYBB 數位內容購買、取消與退款政策。',
})
</script>

<template>
  <article class="policy-page">
    <h1>退款政策</h1>

    <p class="updated-at">
      最後更新日期：2026 年 9 月 8 日
    </p>

    <section>
      <h2>一、商品性質</h2>

      <p>
        MYBB 提供的付費小說章節屬於非以有形媒介提供的數位內容。
        使用者付款完成並取得章節閱讀權限後，即視為數位內容已開始提供。
      </p>
    </section>

    <section>
      <h2>二、七日解除權說明</h2>

      <p>
        依通訊交易解除權合理例外情事適用準則，非以有形媒介提供的
        數位內容，經消費者事先同意始提供者，得排除消費者保護法
        第十九條七日解除權之適用。
      </p>

      <p>
        使用者完成付款前，網站將明確告知商品為付款後立即提供的數位內容，
        並取得使用者同意。付款成功且章節閱讀權限開通後，
        除法令另有規定或符合下列退款情形外，不接受因個人因素提出的退款。
      </p>
    </section>

    <section>
      <h2>三、可以申請退款的情形</h2>

      <ul>
        <li>同一筆商品發生重複扣款。</li>
        <li>付款成功，但系統未開通對應章節閱讀權限。</li>
        <li>購買內容因系統問題持續無法正常閱讀。</li>
        <li>實際提供的商品與付款頁標示內容明顯不符。</li>
        <li>其他依法應辦理退款的情形。</li>
      </ul>
    </section>

    <section>
      <h2>四、不適用退款的情形</h2>

      <ul>
        <li>章節閱讀權限已正常開通，僅因個人喜好改變。</li>
        <li>因使用者裝置、網路或瀏覽器設定所造成的暫時性問題。</li>
        <li>使用者帳號或登入資料保管不當所造成的問題。</li>
        <li>違反服務條款而遭限制或停止使用服務。</li>
      </ul>
    </section>

    <section>
      <h2>五、退款申請方式</h2>

      <p>
        如需申請退款，請聯絡客服，並提供訂單編號、會員帳號、
        購買章節及申請原因。我們確認交易與使用狀態後，
        將通知審核結果。
      </p>

      <p>
        客服信箱：
        <a href="mailto:yehweiyang@gmail.com">
          yehweiyang@gmail.com
        </a>
      </p>
    </section>

    <section>
      <h2>六、退款方式與時間</h2>

      <p>
        核准退款後，原則上將透過原付款方式辦理。
        實際入帳時間依付款機構及發卡銀行的處理時間為準。
      </p>
    </section>

    <section>
      <h2>七、法定權利</h2>

      <p>
        本政策不限制消費者依法享有的其他權利。
        如本政策與中華民國法令的強制規定牴觸，
        應以相關法令規定為準。
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