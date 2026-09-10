export default defineEventHandler((event) => {
    setResponseHeader(event, 'Cache-Control', 'no-store')

    const orderNo = getQuery(event).order

    const destination =
        typeof orderNo === 'string' &&
        /^[A-Za-z0-9]{1,30}$/.test(orderNo)
            ? `/account?paymentOrder=${encodeURIComponent(orderNo)}`
            : '/account'

    // 僅轉址，不根據返回資料開通權限。
    return sendRedirect(event, destination, 303)
})