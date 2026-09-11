import { createClient } from '@supabase/supabase-js'
import type { H3Event } from 'h3'

export function commentError(
    statusCode: number,
    message: string,
): never {
    throw createError({
        statusCode,
        data: { message },
    })
}

export function commentDatabase(event: H3Event) {
    const config = useRuntimeConfig(event)

    return createClient(
        config.public.supabaseUrl,
        config.supabaseSecretKey,
        {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
            },
        },
    )
}

export async function requireCommentArticle(event: H3Event) {
    const slug = getRouterParam(event, 'slug') ?? ''

    if (
        slug.length > 160
        || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
    ) {
        commentError(400, '文章網址不正確。')
    }

    const article = await queryCollection(event, 'tech')
        .where('stem', '=', `tech/${slug}`)
        .first()

    if (!article) {
        commentError(404, '找不到這篇文章。')
    }

    return slug
}