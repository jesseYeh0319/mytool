/*
 * 除錯用端點，只回傳「有沒有讀到值」跟長度/局部內容，
 * 不會回傳任何 secret 的完整內容。
 *
 * 確認完 Vercel 環境變數是否正確寫入後，記得刪掉這個檔案，
 * 不要留在正式站上。
 */
export default defineEventHandler((event) => {
    const config = useRuntimeConfig(event)

    const hostHeader = (getHeader(event, 'host') ?? '')
        .split(':')[0]
        .toLowerCase()

    const allowedHostnames = (config.turnstileAllowedHostnames || '')
        .split(',')
        .map(host => host.trim().toLowerCase())
        .filter(Boolean)

    const siteKey = config.public.turnstileSiteKey || ''

    return {
        public: {
            turnstileSiteKeySet: Boolean(siteKey),
            turnstileSiteKeyPreview: siteKey
                ? `${siteKey.slice(0, 6)}...${siteKey.slice(-4)}（長度 ${siteKey.length}）`
                : '(空白，沒有讀到值)',
            supabaseUrlSet: Boolean(config.public.supabaseUrl),
            supabaseKeySet: Boolean(config.public.supabaseKey),
        },

        server: {
            turnstileSecretKeySet: Boolean(config.turnstileSecretKey),
            turnstileSecretKeyLength: config.turnstileSecretKey?.length ?? 0,

            turnstileAllowedHostnamesRaw:
                config.turnstileAllowedHostnames || '(空白，沒有讀到值)',
            turnstileAllowedHostnamesParsed: allowedHostnames,

            commentRateLimitSecretSet: Boolean(config.commentRateLimitSecret),
            commentRateLimitSecretLength:
                config.commentRateLimitSecret?.length ?? 0,
            commentRateLimitSecretLongEnough:
                (config.commentRateLimitSecret?.length ?? 0) >= 32,
        },

        request: {
            // 這個 host 就是等一下 Turnstile siteverify 會拿去比對的來源。
            hostHeaderSeenByServer: hostHeader || '(空白)',
            hostnameMatchesAllowedList:
                allowedHostnames.includes(hostHeader),
        },
    }
})
