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

    const recoveryUserId = useState<string | null>(
        'password-recovery-user-id',
        () => null,
    )

    if (import.meta.client) {
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'PASSWORD_RECOVERY' && session) {
                recoveryUserId.value = session.user.id
            } else if (
                event === 'SIGNED_OUT' ||
                event === 'SIGNED_IN' ||
                (
                    recoveryUserId.value &&
                    session?.user.id !== recoveryUserId.value
                )
            ) {
                recoveryUserId.value = null
            }
        })

        if (import.meta.hot) {
            import.meta.hot.dispose(() => {
                subscription.unsubscribe()
            })
        }
    }

    return {
        provide: {
            supabase,
        },
    }
})