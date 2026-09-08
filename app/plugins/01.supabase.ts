import { createClient } from '@supabase/supabase-js'

export default defineNuxtPlugin(() => {
    const config = useRuntimeConfig()

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