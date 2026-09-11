import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import test from 'node:test'
import ts from 'typescript'

// 在隔離環境執行實際 API handler，模擬資料庫以檢查授權與查詢範圍。
function handler(file, overrides = {}) {
  const calls = []
  const db = {
    from(table) {
      const result = { data: table === 'support_report_events' ? [] : { report_no: 'RP20260911-ABCDEF' }, count: 1, error: null }
      const chain = new Proxy({}, { get(_, method) {
        if (method === 'then') return (resolve) => resolve(result)
        return (...args) => { calls.push([table, method, ...args]); return chain }
      } })
      return chain
    },
    rpc: async (...args) => { calls.push(['rpc', ...args]); return { error: null } },
  }
  const globals = {
    exports: {}, defineEventHandler: fn => fn,
    createError: args => Object.assign(new Error(args.data?.message), args),
    supportSession: async (_event, admin) => {
      if (admin && !overrides.isAdmin) throw Object.assign(new Error(), { statusCode: 403 })
      return { db, user: { id: 'reader-a' }, isAdmin: overrides.isAdmin ?? false }
    },
    supportPublicFields: 'report_no,status',
    supportReportNo: () => 'RP20260911-ABCDEF',
    getQuery: () => overrides.query ?? {},
    readBody: async () => overrides.body,
  }
  const source = readFileSync(new URL(`../server/api/support/${file}`, import.meta.url), 'utf8')
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, globals)
  return { run: () => globals.exports.default({}), calls }
}
test('會員查詢清單與明細均限定本人', async () => {
  for (const file of ['reports.get.ts', 'reports/[reportNo].get.ts']) {
    const api = handler(file)
    await api.run()
    assert.ok(api.calls.some(call => call[1] === 'eq' && call[2] === 'user_id' && call[3] === 'reader-a'))
    assert.ok(api.calls.filter(call => call[1] === 'select').every(call => !call[2].includes('admin_note')))
  }
})
test('普通會員不能以管理範圍查詢', async () => {
  for (const file of ['reports.get.ts', 'reports/[reportNo].get.ts']) {
    const api = handler(file, { query: { scope: 'admin' } })
    await assert.rejects(api.run, { statusCode: 403 })
    assert.equal(api.calls.length, 0)
  }
})
test('普通會員不能修改案件', async () => {
  const api = handler('reports/[reportNo].patch.ts')
  await assert.rejects(api.run, { statusCode: 403 })
  assert.equal(api.calls.length, 0)
})
test('管理者查看自己的回報時仍限定本人', async () => {
  const api = handler('reports.get.ts', { isAdmin: true })
  await api.run()
  assert.ok(api.calls.some(call => call[2] === 'user_id'))
})
test('管理者結案必須附公開結果', async () => {
  const api = handler('reports/[reportNo].patch.ts', { isAdmin: true, body: { status: 'closed', version: 0, reply: '  ', adminNote: '' } })
  await assert.rejects(api.run, { statusCode: 400 })
  assert.equal(api.calls.length, 0)
})
test('回覆與狀態透過同一函式及版本寫入', async () => {
  const api = handler('reports/[reportNo].patch.ts', { isAdmin: true, body: { status: 'resolved', version: 3, reply: ' 已修正 ', adminNote: '私人備註' } })
  await api.run()
  assert.equal(api.calls.length, 1)
  assert.equal(api.calls[0][2].p_reply, '已修正')
  assert.equal(api.calls[0][2].p_version, 3)
  assert.equal(api.calls[0][2].p_actor, 'reader-a')
})
test('拒絕錯誤分頁參數', async () => {
  await assert.rejects(handler('reports.get.ts', { query: { page: '-1' } }).run, { statusCode: 400 })
})

test('實際身分驗證僅信任 app_metadata 並拒絕無效登入', async () => {
  const source = readFileSync(new URL('../server/utils/support.ts', import.meta.url), 'utf8')
  let user = { id: 'reader-a', user_metadata: { support_admin: true }, app_metadata: {} }
  const globals = {
    exports: {},
    require: () => ({ createClient: () => ({ auth: { getUser: async () => ({ data: { user }, error: null }) } }) }),
    setResponseHeader: () => {}, getHeader: () => 'Bearer test-token',
    useRuntimeConfig: () => ({ public: {} }),
    createError: args => Object.assign(new Error(), args),
  }
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, globals)
  await assert.rejects(() => globals.exports.supportSession({}, true), { statusCode: 403 })
  user.app_metadata.support_admin = true
  assert.equal((await globals.exports.supportSession({}, true)).isAdmin, true)
  user = null
  await assert.rejects(() => globals.exports.supportSession({}), { statusCode: 401 })
})
