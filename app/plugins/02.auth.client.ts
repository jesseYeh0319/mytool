export default defineNuxtPlugin((nuxtApp) => {
    const {
        initializeAuth,
    } = useAuth()

    let subscription:
        Awaited<ReturnType<typeof initializeAuth>> | undefined

    nuxtApp.hook('app:mounted', async () => {
        subscription = await initializeAuth()
    })

    if (import.meta.hot) {
        import.meta.hot.dispose(() => {
            subscription?.unsubscribe()
        })
    }
})