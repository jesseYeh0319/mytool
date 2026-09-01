export default defineNuxtConfig({
  modules: ['@nuxt/content'],

  content: {
    experimental: {
      sqliteConnector: 'native',
    },

    build: {
      markdown: {
        highlight: {
          theme: 'github-dark',

          langs: [
            'java',
            'sql',
            'js',
            'ts',
            'vue',
            'html',
            'css',
            'json',
            'yaml',
            'shell',
            'bash',
          ],
        },
      },
    },
  },

  app: {
    head: {
      htmlAttrs: {
        lang: 'zh-TW',
      },

      meta: [
        {
          name: 'author',
          content: 'MYBB',
        },
      ],
    },
  },

  devtools: { enabled: true },
})