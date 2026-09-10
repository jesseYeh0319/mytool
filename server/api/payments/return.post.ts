export default defineEventHandler((event) => {
    setResponseHeader(event, 'Cache-Control', 'no-store')

    // 此路由只負責返回網站。
    // 付款狀態與閱讀權限由 notify API 更新。
    return sendRedirect(event, '/account', 303)
})