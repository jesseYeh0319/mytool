import type { User } from '@supabase/supabase-js'

export const useAuth = () => {
    const supabase = useSupabase()

    const user = useState<User | null>('auth-user', () => null)
    const initialized = useState<boolean>('auth-initialized', () => false)

    const loadUser = async () => {
        const {
            data: { user: currentUser },
            error,
        } = await supabase.auth.getUser()

        if (error) {
            console.error('取得登入使用者失敗:', error)
        }

        user.value = currentUser
        initialized.value = true
    }

    const initializeAuth = async () => {
        await loadUser()

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            user.value = session?.user ?? null
            initialized.value = true
        })

        return subscription
    }

    return {
        user,
        initialized,
        loadUser,
        initializeAuth,
    }
}