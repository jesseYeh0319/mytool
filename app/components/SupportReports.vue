<script setup lang="ts">
const props = defineProps<{ admin?: boolean }>()
const { user, initialized } = useAuth()
const supabase = useSupabase()
const route = useRoute()
const statuses: Record<string, string> = { open: '待處理', in_progress: '處理中', resolved: '已解決', closed: '已結案' }
const categories: Record<string, string> = { content: '章節錯字、內容缺漏', reading: '閱讀進度或書籤異常', paid_unreadable: '已付款但無法閱讀', other: '其他問題' }
type Report = {
  report_no: string; category: string; description: string; status: string
  book_slug: string | null; chapter_slug: string | null; order_no: string | null
  created_at: string; updated_at: string; resolved_at: string | null; version: number
  contact_email?: string; admin_note?: string; user_agent?: string
}
type Detail = { report: Report; history: { id: number; status: string; reply: string; created_at: string }[] }
const reports = ref<Report[]>([])
const total = ref(0)
const page = ref(1)
const filter = ref('all')
const isAdmin = ref(false)
const loading = ref(false)
const detailLoading = ref(false)
const saving = ref(false)
const error = ref('')
const detailError = ref('')
const notice = ref('')
const detail = ref<Detail | null>(null)
const status = ref('open')
const reply = ref('')
const adminNote = ref('')
let generation = 0
let detailGeneration = 0
const selected = computed(() => typeof route.query.report === 'string' ? route.query.report : '')
const scope = computed(() => props.admin ? 'admin' : 'mine')
const date = (value: string) => new Date(value).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })
function message(e: unknown) {
  const failure = e as { statusCode?: number; data?: { data?: { message?: string } } }
  return failure.data?.data?.message || (failure.statusCode === 403 ? '你沒有客服管理權限。' : failure.statusCode === 404 ? '找不到這筆回報。' : failure.statusCode === 401 ? '登入已過期，請重新登入。' : '目前無法讀取或儲存回報，請稍後再試。')
}
async function headers() {
  const { data: { session }, error } = await supabase.auth.getSession()
  if (error || !session) throw { statusCode: 401 }
  return { Authorization: `Bearer ${session.access_token}` }
}
async function loadReports() {
  const id = ++generation
  reports.value = []; total.value = 0; error.value = ''; isAdmin.value = false
  if (!import.meta.client || !initialized.value || !user.value) { loading.value = false; return }
  loading.value = true
  try {
    const result = await $fetch<{ reports: Report[]; total: number; isAdmin: boolean }>('/api/support/reports', {
      headers: await headers(), query: { scope: scope.value, page: page.value, status: filter.value },
    })
    if (id !== generation) return
    reports.value = result.reports; total.value = result.total; isAdmin.value = result.isAdmin
  } catch (e) { if (id === generation) error.value = message(e) }
  finally { if (id === generation) loading.value = false }
}
async function loadDetail() {
  const id = ++detailGeneration
  detail.value = null; detailError.value = ''; reply.value = ''; adminNote.value = ''; notice.value = ''
  if (!import.meta.client || !initialized.value || !user.value || !selected.value) { detailLoading.value = false; return }
  detailLoading.value = true
  try {
    const result = await $fetch<Detail>(`/api/support/reports/${encodeURIComponent(selected.value)}`, {
      headers: await headers(), query: { scope: scope.value },
    })
    if (id !== detailGeneration) return
    detail.value = result; status.value = result.report.status; adminNote.value = result.report.admin_note ?? ''
  } catch (e) { if (id === detailGeneration) detailError.value = message(e) }
  finally { if (id === detailGeneration) detailLoading.value = false }
}
async function save() {
  if (!detail.value || saving.value) return
  const id = detailGeneration
  const userId = user.value?.id
  const reportNo = detail.value.report.report_no
  const body = { status: status.value, reply: reply.value, adminNote: adminNote.value, version: detail.value.report.version }
  saving.value = true; detailError.value = ''; notice.value = ''
  try {
    const authorization = await headers()
    if (id !== detailGeneration || user.value?.id !== userId) return
    await $fetch(`/api/support/reports/${reportNo}`, {
      method: 'PATCH', headers: authorization, retry: 0, body,
    })
    if (id !== detailGeneration) return
    await Promise.all([loadReports(), loadDetail()])
    if (id + 1 === detailGeneration) notice.value = '已儲存處理結果。公開回覆與狀態已更新至會員的回報紀錄。'
  } catch (e) { if (id === detailGeneration) detailError.value = message(e) }
  finally { saving.value = false }
}
watch([initialized, () => user.value?.id, page, filter], loadReports, { immediate: true })
watch([initialized, () => user.value?.id, selected], loadDetail, { immediate: true })
onBeforeUnmount(() => { generation++; detailGeneration++ })
</script>

<template>
  <section class="reports-page">
    <h1>{{ admin ? '客服案件管理' : '我的回報' }}</h1>
    <nav class="actions" aria-label="客服導覽">
      <NuxtLink to="/account">會員中心</NuxtLink>
      <NuxtLink to="/support">回報問題</NuxtLink>
      <NuxtLink v-if="!admin && isAdmin" to="/admin/support">管理客服案件</NuxtLink>
      <NuxtLink v-if="admin" to="/my-reports">我的回報</NuxtLink>
    </nav>
    <p v-if="!initialized">讀取會員資料中…</p>
    <div v-else-if="!user">
      <p>登入後即可查看回報紀錄與處理結果。</p>
      <NuxtLink :to="{ path: '/login', query: { redirect: route.fullPath } }">登入</NuxtLink>
    </div>
    <template v-else>
      <div class="actions">
        <label>處理狀態
          <select v-model="filter" @change="page = 1">
            <option value="all">全部</option>
            <option v-for="(label, value) in statuses" :key="value" :value="value">{{ label }}</option>
          </select>
        </label>
        <button :disabled="loading || saving" @click="loadReports(); loadDetail()">重新載入</button>
      </div>
      <p v-if="error" role="alert">{{ error }}</p>
      <p v-else-if="loading" role="status">讀取回報中…</p>
      <template v-else>
        <p v-if="!reports.length">{{ filter === 'all' ? '目前沒有回報紀錄。' : '目前沒有這個狀態的回報。' }}</p>
        <ul class="report-list">
          <li v-for="report in reports" :key="report.report_no">
            <NuxtLink :to="{ path: route.path, query: { report: report.report_no } }">
              {{ report.report_no }} · {{ categories[report.category] }}
            </NuxtLink>
            <span class="badge">{{ statuses[report.status] }}</span>
            <p class="excerpt">{{ report.description }}</p>
            <small>送出：{{ date(report.created_at) }}</small>
          </li>
        </ul>
        <div v-if="total > 20" class="actions">
          <button :disabled="page <= 1" @click="page--">上一頁</button>
          <span>第 {{ page }} / {{ Math.ceil(total / 20) }} 頁，共 {{ total }} 筆</span>
          <button :disabled="page * 20 >= total" @click="page++">下一頁</button>
        </div>
      </template>
      <p v-if="detailLoading" role="status">讀取案件內容中…</p>
      <p v-if="detailError" role="alert">{{ detailError }}</p>
      <p v-if="notice" role="status">{{ notice }}</p>
      <article v-if="detail" class="detail">
        <h2>回報 {{ detail.report.report_no }}</h2>
        <p>{{ categories[detail.report.category] }} · <strong>{{ statuses[detail.report.status] }}</strong></p>
        <p>送出：{{ date(detail.report.created_at) }}</p>
        <p v-if="detail.report.resolved_at">處理完成：{{ date(detail.report.resolved_at) }}</p>
        <p v-if="detail.report.order_no">相關訂單：{{ detail.report.order_no }}</p>
        <p v-if="detail.report.book_slug">相關章節：{{ detail.report.book_slug }} / {{ detail.report.chapter_slug }}</p>
        <h3>問題描述</h3>
        <p class="preserve">{{ detail.report.description }}</p>
        <h3>處理歷程與客服回覆</h3>
        <p v-if="!detail.history.length">尚無客服回覆。目前狀態：{{ statuses[detail.report.status] }}。</p>
        <ol class="history">
          <li v-for="entry in detail.history" :key="entry.id">
            <small>{{ date(entry.created_at) }}</small> · <strong>{{ statuses[entry.status] }}</strong>
            <p class="preserve">{{ entry.reply || '客服已更新處理狀態。' }}</p>
          </li>
        </ol>
        <form v-if="admin" @submit.prevent="save">
          <h3>處理案件</h3>
          <p>聯絡信箱：{{ detail.report.contact_email }}</p>
          <details><summary>瀏覽器資訊</summary><p>{{ detail.report.user_agent || '未提供' }}</p></details>
          <label for="case-status">更新狀態</label>
          <select id="case-status" v-model="status" :disabled="saving">
            <option v-for="(label, value) in statuses" :key="value" :value="value">{{ label }}</option>
          </select>
          <label for="case-reply">公開回覆／處理結果</label>
          <textarea id="case-reply" v-model="reply" rows="5" maxlength="2000" :required="['resolved', 'closed'].includes(status)" :disabled="saving" />
          <small>會員可以看到此回覆。已解決或結案時必填，最多 2000 字。</small>
          <label for="case-note">內部備註（僅管理者可見）</label>
          <textarea id="case-note" v-model="adminNote" rows="3" maxlength="4000" :disabled="saving" />
          <button :disabled="saving">{{ saving ? '儲存中…' : '儲存處理結果' }}</button>
        </form>
      </article>
    </template>
  </section>
</template>

<style scoped>
.reports-page { max-width: 850px; margin: auto; overflow-wrap: anywhere; }
.actions { display: flex; flex-wrap: wrap; gap: 16px; align-items: center; margin: 20px 0; }
button, select, textarea { font: inherit; padding: 10px 12px; border: 1px solid #bbb; border-radius: 6px; }
button { cursor: pointer; background: #f3f6fa; min-height: 44px; }
button:disabled { opacity: .5; cursor: not-allowed; }
select { background: white; }
.report-list { padding: 0; list-style: none; }
.report-list li, .detail { padding: 20px; margin: 14px 0; border: 1px solid #ddd; border-radius: 10px; }
.badge { display: inline-block; padding: 4px 10px; background: #eef3fc; border-radius: 20px; margin: 6px; }
.excerpt { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.preserve { white-space: pre-wrap; line-height: 1.8; }
.history { padding-left: 22px; }
.history li { padding: 10px 0; border-bottom: 1px solid #eee; }
small { color: #666; }
form { display: grid; gap: 12px; border-top: 1px solid #ddd; margin-top: 24px; }
textarea { width: 100%; box-sizing: border-box; resize: vertical; }
[role="alert"] { color: #a4262c; }
</style>
