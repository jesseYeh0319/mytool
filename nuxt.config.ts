export default defineNuxtConfig({
  modules: ['@nuxt/content'],

  content: {
    experimental: {
      sqliteConnector: 'native',
    },
  },

  devtools: { enabled: true },
})