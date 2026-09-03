import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

function getTaiwanIsoString() {
    const now = new Date()

    const formatter = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Asia/Taipei',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    })

    const parts = formatter.formatToParts(now)

    const values = Object.fromEntries(
        parts.map(part => [part.type, part.value])
    )

    return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}+08:00`
}

function validateSlug(slug) {
    if (!slug) {
        return 'slug 不可以為空'
    }

    const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

    if (!slugPattern.test(slug)) {
        return 'slug 只能包含小寫英文、數字與連字號，例如：spring-boot-validation'
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

async function main() {
    const rl = readline.createInterface({
        input,
        output,
    })

    try {
        // =========================
        // slug
        // =========================

        const slug = (
            await rl.question('文章 slug: ')
        ).trim()

        const slugError = validateSlug(slug)

        if (slugError) {
            console.error(`錯誤：${slugError}`)
            process.exitCode = 1
            return
        }

        const targetDir = path.resolve(
            'content',
            'tech'
        )

        const targetFile = path.join(
            targetDir,
            `${slug}.md`
        )

        if (fs.existsSync(targetFile)) {
            console.error(
                `錯誤：文章已經存在：${targetFile}`
            )

            process.exitCode = 1
            return
        }

        // =========================
        // title
        // =========================

        const title = (
            await rl.question('文章標題: ')
        ).trim()

        const titleError = validateRequired(
            title,
            '文章標題'
        )

        if (titleError) {
            console.error(`錯誤：${titleError}`)
            process.exitCode = 1
            return
        }

        // =========================
        // description
        // =========================

        const description = (
            await rl.question('文章描述: ')
        ).trim()

        const descriptionError = validateRequired(
            description,
            '文章描述'
        )

        if (descriptionError) {
            console.error(
                `錯誤：${descriptionError}`
            )

            process.exitCode = 1
            return
        }

        // =========================
        // category
        // =========================

        const category = (
            await rl.question('分類: ')
        ).trim()

        const categoryError = validateRequired(
            category,
            '分類'
        )

        if (categoryError) {
            console.error(
                `錯誤：${categoryError}`
            )

            process.exitCode = 1
            return
        }

        // =========================
        // tags
        // =========================

        const tagsInput = (
            await rl.question(
                'Tags（逗號分隔，可留空）: '
            )
        ).trim()

        const tags = tagsInput
            .split(',')
            .map(tag => tag.trim())
            .filter(Boolean)

        const tagsYaml =
            tags.length > 0
                ? `\n${tags
                    .map(
                        tag =>
                            `  - ${escapeYamlString(tag)}`
                    )
                    .join('\n')}`
                : ' []'

        // =========================
        // Markdown
        // =========================

        const content = `---
title: ${escapeYamlString(title)}
description: ${escapeYamlString(description)}
date: ${getTaiwanIsoString()}
category: ${escapeYamlString(category)}
tags:${tagsYaml}
---

# ${title}

## 問題背景

在這裡說明這篇文章要處理的問題。

## 原因分析

說明問題發生的原因。

## 解決方式

說明實際解法。

## 驗證結果

說明如何確認問題已經解決。

## 注意事項

記錄容易踩到的坑或版本差異。

## 小結

整理這篇文章最重要的內容。
`

        // =========================
        // 建立檔案
        // =========================

        fs.mkdirSync(targetDir, {
            recursive: true,
        })

        fs.writeFileSync(
            targetFile,
            content,
            'utf8'
        )

        console.log('')
        console.log('文章建立完成：')
        console.log(targetFile)
    } finally {
        rl.close()
    }
}

main().catch(error => {
    console.error('')
    console.error('建立文章時發生錯誤：')
    console.error(error)

    process.exitCode = 1
})