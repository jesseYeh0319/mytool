import { createHmac } from 'node:crypto'
import { isIP } from 'node:net'
import {
    commentDatabase,
    commentError,
    requireCommentArticle,
} from '../../../utils/techComments'

export default defineEventHandler(async (event) => {
    setResponseHeader(event, 'Cache-Control', 'no-store')

    if (
        !getHeader(event, 'content-type')
            ?.toLowerCase()
            .startsWith('application/json')
    ) {
        commentError(415, '請使用留言表單送出。')
    }

    // 實際計算接收大小，不只相信 Content-Length。
    const stream = getRequestWebStream(event)

    if (!stream) {
        commentError(400, '留言資料不完整。')
    }

    const reader = stream.getReader()
    const chunks: Uint8Array[] = []
    let size = 0

    try {
        while (true) {
            const { done, value } = await reader.read()

            if (done) break
            if (!value) continue

            size += value.byteLength

            if (size > 16 * 1024) {
                await reader.cancel()
                commentError(413, '送出的資料太大。')
            }

            chunks.push(value)
        }
    } finally {
        reader.releaseLock()
    }

    let input: Record<string, unknown>

    try {
        const parsed: unknown = JSON.parse(
            Buffer.concat(chunks).toString('utf8'),
        )

        if (
            !parsed
            || typeof parsed !== 'object'
            || Array.isArray(parsed)
        ) {
            commentError(400, '留言格式不正確。')
        }

        input = parsed as Record<string, unknown>
    } catch {
        commentError(400, '留言格式不正確。')
    }

    const nickname = typeof input.nickname === 'string'
        ? input.nickname.trim()
        : ''

    const content = typeof input.content === 'string'
        ? input.content.trim()
        : ''

    const token = typeof input.token === 'string'
        ? input.token
        : ''

    if (
        Array.from(nickname).length < 1
        || Array.from(nickname).length > 30
    ) {
        commentError(400, '暱稱需要 1 到 30 個字。')
    }

    if (
        Array.from(content).length < 2
        || Array.from(content).length > 1000
    ) {
        commentError(400, '留言需要 2 到 1000 個字。')
    }

    if (!token || token.length > 2048) {
        commentError(400, '請先完成人機驗證。')
    }

    // 隱藏欄位：一般讀者不會填寫。
    if (input.website !== undefined && input.website !== '') {
        commentError(400, '留言驗證未通過，請重新整理後再試。')
    }

    const slug = await requireCommentArticle(event)
    const config = useRuntimeConfig(event)

    const allowedHostnames = config.turnstileAllowedHostnames
        .split(',')
        .map(host => host.trim().toLowerCase())
        .filter(Boolean)

    if (
        !config.turnstileSecretKey
        || config.commentRateLimitSecret.length < 32
        || !allowedHostnames.length
    ) {
        console.error('[tech-comments] 留言驗證設定不完整')
        commentError(503, '留言功能尚未準備完成，請稍後再試。')
    }

    /*
     * 正式部署在 Vercel 時使用平台覆寫的 IP header。
     * 本機或直接運行 Node 時，只使用連線來源 IP。
     * 不任意信任訪客自行傳入的 X-Forwarded-For。
     */
    const sourceIP = process.env.VERCEL === '1'
        ? getHeader(event, 'x-forwarded-for')?.split(',')[0]?.trim()
        : getRequestIP(event, { xForwardedFor: false })

    const normalizedIP = sourceIP
        ?.trim()
        .replace(/^::ffff:/i, '')

    const validIP = normalizedIP && isIP(normalizedIP)
        ? normalizedIP
        : undefined

    // 僅開發模式允許使用共用的本機限流識別。
    // 正式環境仍必須取得有效 IP。
    const ip = validIP ?? (import.meta.dev ? '127.0.0.1' : undefined)

    if (!ip) {
        commentError(503, '目前無法驗證連線來源，請稍後再試。')
    }

    let verification: {
        success: boolean
        hostname?: string
        action?: string
    }

    try {
        verification = await $fetch(
            'https://challenges.cloudflare.com/turnstile/v0/siteverify',
            {
                method: 'POST',
                body: {
                    secret: config.turnstileSecretKey,
                    response: token,
                    ...(validIP ? { remoteip: validIP } : {}),
                },
                timeout: 10000,
                retry: 0,
            },
        )
    } catch {
        commentError(503, '驗證服務暫時無法連線，請重新驗證後再試。')
    }

    if (
        !verification.success
        || verification.action !== 'tech_comment'
        || !allowedHostnames.includes(
            verification.hostname?.toLowerCase() ?? '',
        )
    ) {
        commentError(400, '人機驗證已失效或未通過，請重新驗證。')
    }

    const ipHash = createHmac(
        'sha256',
        config.commentRateLimitSecret,
    )
        .update(ip)
        .digest('hex')

    // 開發模式取不到真實 IP，或使用 loopback 時，標記為本機測試。
// 不將限流用的備用 IP 誤存成訪客的真實 IP。
    const isLocalTest = import.meta.dev && (
        !validIP
        || validIP === '::1'
        || validIP.startsWith('127.')
    )

    const db = commentDatabase(event)

    const { data, error } = await db
        .rpc('create_tech_comment_with_ip', {
            p_article_slug: slug,
            p_nickname: nickname,
            p_content: content,
            p_ip_hash: ipHash,
            p_ip_address: isLocalTest ? null : validIP,
            p_is_local: isLocalTest,
        })
        .single()

    if (error) {
        if (error.message.includes('comment_cooldown')) {
            setResponseHeader(event, 'Retry-After', '60')
            commentError(429, '留言太頻繁，請等 60 秒後再試。')
        }

        if (error.message.includes('comment_daily_limit')) {
            commentError(
                429,
                '此網路在過去 24 小時的留言已達上限，請晚點再來。',
            )
        }

        console.error('[tech-comments] 寫入失敗', {
            code: error.code,
        })

        commentError(
            500,
            '目前無法確認留言是否送出，請先重新載入留言查看。',
        )
    }

    const result = data as {
        comment_id: string
        is_duplicate: boolean
    }

    return {
        duplicate: result.is_duplicate,
    }
})