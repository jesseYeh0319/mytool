export default defineNuxtPlugin(async () => {
    const {
        initializeAuth,
    } = useAuth()

    const subscription = await initializeAuth()

    if (import.meta.hot) {
        import.meta.hot.dispose(() => {
            subscription.unsubscribe()
        })
    }
})