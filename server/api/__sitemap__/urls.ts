export default defineSitemapEventHandler(async (event) => {
    const techArticles = await queryCollection(event, 'tech').all()
    const novelBooks = await queryCollection(event, 'novelBooks').all()
    const novelChapters = await queryCollection(event, 'novelChapters').all()

    return [
        ...techArticles.map(article => ({
            loc: article.path,
        })),

        ...novelBooks.map(book => ({
            loc: book.path,
        })),

        ...novelChapters.map(chapter => ({
            loc: chapter.path,
        })),
    ]
})