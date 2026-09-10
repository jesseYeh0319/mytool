import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { createClient } from '@supabase/supabase-js'

function getTaiwanDateString() {
    const formatter = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Asia/Taipei',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    })

    return formatter.format(new Date())
}

function validateSlug(slug) {
    if (!slug) {
        return 'slug 不可以為空'
    }

    const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

    if (!slugPattern.test(slug)) {
        return 'slug 只能包含小寫英文、數字與連字號，例如：my-novel'
    }

    return null
}

function validateRequired(value, fieldName) {
    if (!value.trim()) {
        return `${fieldName}不可以為空`
    }

    return null
}

function escapeYamlString(value) {
    return JSON.stringify(value)
}

async function askYesNo(rl, question) {
    while (true) {
        const answer = (
            await rl.question(`${question}（y/n）: `)
        ).trim().toLowerCase()

        if (answer === 'y' || answer === 'yes') {
            return true
        }

        if (answer === 'n' || answer === 'no') {
            return false
        }

        console.log('請輸入 y 或 n。')
    }
}

function readBodyFile(bodyPath) {
    if (!fs.existsSync(bodyPath)) {
        return {
            error: `找不到正文檔案：${bodyPath}`,
        }
    }

    const body = fs.readFileSync(bodyPath, 'utf8').trim()

    if (!body) {
        return {
            error: `正文檔案是空的：${bodyPath}`,
        }
    }

    return { body }
}

async function main() {
    const rl = readline.createInterface({
        input,
        output,
    })

    try {
        // =========================
        // 小說 slug
        // =========================

        const bookSlug = (
            await rl.question('小說 slug: ')
        ).trim()

        const bookSlugError = validateSlug(bookSlug)

        if (bookSlugError) {
            console.error(`錯誤：${bookSlugError}`)
            process.exitCode = 1
            return
        }

        const bookDir = path.resolve(
            'content',
            'novels',
            bookSlug
        )

        // 只允許在既有的小說底下新增章節。
        const bookIndex = path.join(bookDir, 'index.md')

        if (!fs.existsSync(bookIndex)) {
            console.error(
                `錯誤：找不到這本小說：${bookIndex}`
            )

            process.exitCode = 1
            return
        }

        // =========================
        // 章節編號
        // =========================

        const chapterInput = (
            await rl.question('章節編號（例如 3）: ')
        ).trim()

        const chapterNumber = Number(chapterInput)

        if (
            !Number.isInteger(chapterNumber) ||
            chapterNumber < 1 ||
            chapterNumber > 9999
        ) {
            console.error(
                '錯誤：章節編號必須是 1 到 9999 的整數'
            )

            process.exitCode = 1
            return
        }

        /*
         * chapter_slug 由編號產生，不讓使用者自己輸入。
         *
         * 檔名、網址與 paid_chapter_content 的 chapter_slug
         * 都來自這個值，是三者不會對不上的關鍵。
         */
        const chapterSlug =
            `chapter-${String(chapterNumber).padStart(2, '0')}`

        const targetFile = path.join(
            bookDir,
            `${chapterSlug}.md`
        )

        if (fs.existsSync(targetFile)) {
            console.error(
                `錯誤：章節已經存在：${targetFile}`
            )

            process.exitCode = 1
            return
        }

        // =========================
        // 標題
        // =========================

        const title = (
            await rl.question('章節標題: ')
        ).trim()

        const titleError = validateRequired(
            title,
            '章節標題'
        )

        if (titleError) {
            console.error(`錯誤：${titleError}`)
            process.exitCode = 1
            return
        }

        // =========================
        // 免費或付費
        // =========================

        const isFree = await askYesNo(rl, '這是免費章節嗎')

        let price = 0
        let body = ''

        if (isFree) {
            const bodyPath = (
                await rl.question(
                    '正文檔案路徑（可留空，之後自己編輯 md）: '
                )
            ).trim()

            if (bodyPath) {
                const result = readBodyFile(bodyPath)

                if (result.error) {
                    console.error(`錯誤：${result.error}`)
                    process.exitCode = 1
                    return
                }

                body = result.body
            }
        } else {
            const priceInput = (
                await rl.question('售價（新台幣整數）: ')
            ).trim()

            price = Number(priceInput)

            if (
                !Number.isInteger(price) ||
                price < 1 ||
                price > 100000
            ) {
                console.error(
                    '錯誤：售價必須是 1 到 100000 的整數'
                )

                process.exitCode = 1
                return
            }

            const bodyPath = (
                await rl.question('正文檔案路徑: ')
            ).trim()

            if (!bodyPath) {
                console.error(
                    '錯誤：付費章節必須提供正文檔案'
                )

                process.exitCode = 1
                return
            }

            const result = readBodyFile(bodyPath)

            if (result.error) {
                console.error(`錯誤：${result.error}`)
                process.exitCode = 1
                return
            }

            body = result.body
        }

        // =========================
        // Markdown
        // =========================

        const frontmatter = [
            '---',
            `title: ${escapeYamlString(title)}`,
            `novel: ${escapeYamlString(bookSlug)}`,
            `chapter: ${chapterNumber}`,
            `date: ${getTaiwanDateString()}`,
            `isFree: ${isFree}`,
            `price: ${price}`,
            '---',
            '',
        ].join('\n')

        /*
         * 付費章節的正文不放進 Markdown。
         *
         * content/ 會進 Git，也會被 Nuxt Content 打包，
         * 放在這裡等於免費公開。
         */
        const placeholder = [
            `# ${title}`,
            '',
            '在這裡撰寫本章正文。',
            '',
        ].join('\n')

        const paidNotice = [
            '<!--',
            '  這是付費章節。',
            '  正文存放在 Supabase 的 paid_chapter_content，',
            '  不要寫在這個檔案裡 —— content/ 是公開的。',
            '-->',
            '',
        ].join('\n')

        const markdown = isFree
            ? `${frontmatter}\n${body ? `${body}\n` : placeholder}`
            : `${frontmatter}\n${paidNotice}`

        // =========================
        // 付費章節：先寫資料庫
        // =========================

        if (!isFree) {
            const supabaseUrl =
                process.env.NUXT_PUBLIC_SUPABASE_URL

            const secretKey =
                process.env.NUXT_SUPABASE_SECRET_KEY

            if (!supabaseUrl || !secretKey) {
                console.error(
                    '錯誤：缺少 NUXT_PUBLIC_SUPABASE_URL 或 NUXT_SUPABASE_SECRET_KEY。'
                )

                console.error(
                    '請改用 npm run new:chapter 執行，它會載入 .env。'
                )

                process.exitCode = 1
                return
            }

            console.log('')
            console.log('即將寫入 Supabase：')
            console.log(`  book_slug    ${bookSlug}`)
            console.log(`  chapter_slug ${chapterSlug}`)
            console.log(`  正文長度     ${body.length} 字`)
            console.log('')

            const confirmed = await askYesNo(
                rl,
                '確定要寫入嗎'
            )

            if (!confirmed) {
                console.log('已取消，沒有建立任何東西。')
                return
            }

            const supabase = createClient(
                supabaseUrl,
                secretKey,
                {
                    auth: {
                        persistSession: false,
                        autoRefreshToken: false,
                    },
                }
            )

            const { error } = await supabase
                .from('paid_chapter_content')
                .upsert(
                    {
                        book_slug: bookSlug,
                        chapter_slug: chapterSlug,
                        body,
                        updated_at: new Date().toISOString(),
                    },
                    {
                        onConflict: 'book_slug,chapter_slug',
                    }
                )

            if (error) {
                console.error('')
                console.error(
                    '寫入正文失敗，沒有建立 Markdown：'
                )

                console.error(error.message)

                process.exitCode = 1
                return
            }

            console.log('正文已寫入 paid_chapter_content。')
        }

        /*
         * Markdown 最後才建立。
         *
         * 資料庫寫入失敗時就不會留下
         * 一個沒有正文的付費章節。
         */
        fs.writeFileSync(targetFile, markdown, 'utf8')

        console.log('')
        console.log('章節建立完成：')
        console.log(targetFile)

        if (!isFree) {
            console.log('')
            console.log('提醒：正文只存在資料庫，不在 Git 裡，請自行保留備份。')
        }
    } finally {
        rl.close()
    }
}

main().catch(error => {
    console.error('')
    console.error('建立章節時發生錯誤：')
    console.error(error)

    process.exitCode = 1
})
