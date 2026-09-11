export default defineNuxtConfig({
    compatibilityDate: '2026-09-08',
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

    runtimeConfig: {
        supabaseSecretKey: '',

        /*
         * 藍新金流機密設定，只能在 Server 使用。
         * 不可以放進 public。
         */
        newebpayMerchantId: '',
        newebpayHashKey: '',
        newebpayHashIv: '',
        newebpayNotifyUrl: '',

        /*
         * 目前先使用藍新測試付款網址。
         */
        newebpayApiUrl:
            'https://ccore.newebpay.com/MPG/mpg_gateway',

        turnstileSecretKey: '',
        turnstileAllowedHostnames: '',
        commentRateLimitSecret: '',

        public: {
            supabaseUrl: '',
            supabaseKey: '',
            turnstileSiteKey: '',
        },
    },

    devtools: { enabled: true },
})
