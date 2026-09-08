import { createClient } from '@supabase/supabase-js'

export default defineNuxtPlugin(() => {
    const config = useRuntimeConfig()

    console.log('[Supabase config]', {
        hasUrl: Boolean(config.public.supabaseUrl),
        urlHost: config.public.supabaseUrl
            ? new URL(config.public.supabaseUrl).host
            : null,
        hasKey: Boolean(config.public.supabaseKey),
    })

    const supabase = createClient(
        config.public.supabaseUrl,
        config.public.supabaseKey,
        {
            auth: {
                persistSession: import.meta.client,
                autoRefreshToken: import.meta.client,
                detectSessionInUrl: import.meta.client,
            },
        }
    )

    return {
        provide: {
            supabase,
        },
    }
})