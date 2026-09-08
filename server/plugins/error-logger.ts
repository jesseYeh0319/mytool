export default defineNitroPlugin((nitroApp) => {
    nitroApp.hooks.hook(
        'error',
        (error, context) => {
            console.error(
                '[Nitro server error]',
                {
                    path: context.event?.path,
                    message: error.message,
                    stack: error.stack,
                }
            )
        }
    )
})