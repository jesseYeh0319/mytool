export default defineNuxtConfig({
  modules: [
    '@nuxt/content',
    '@nuxtjs/sitemap',
    '@nuxtjs/robots',
  ],

  site: {
    url: 'https://mytool-mybb.vercel.app',
    name: 'MYBB',
  },

  sitemap: {
    sources: [
      '/api/__sitemap__/urls',
    ],
  },

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