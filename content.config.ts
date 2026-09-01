import { defineContentConfig, defineCollection, z } from '@nuxt/content'

export default defineContentConfig({
  collections: {
    content: defineCollection({
      type: 'page',
      source: '**',
    }),

    tech: defineCollection({
      type: 'page',
      source: 'tech/**',

      schema: z.object({
        title: z.string(),
        description: z.string(),
        date: z.string(),

        category: z.string(),

        tags: z.array(
            z.string()
        ).default([]),
      }),
    }),

    novelBooks: defineCollection({
      type: 'page',
      source: 'novels/*/index.md',
      schema: z.object({
        title: z.string(),
        description: z.string(),
        author: z.string(),
        status: z.string(),
        cover: z.string(),
      }),
    }),

    novelChapters: defineCollection({
      type: 'page',
      source: 'novels/*/chapter-*.md',
      schema: z.object({
        title: z.string(),
        novel: z.string(),
        chapter: z.number(),
        date: z.string(),
        isFree: z.boolean(),
      }),
    }),
  },
})