---
title: 我的第一篇技術紀錄
description: 記錄這個網站從零開始建立的過程
date: 2026-08-25
category: Web Development
tags:
  - Nuxt
  - Vue
  - Nuxt Content
---

# 我的第一篇技術紀錄

這是我的第一篇技術文章。

今天開始建立自己的技術紀錄與小說網站。

## 為什麼建立這個網站？

我希望有一個自己的地方，可以長期整理：

- 軟體開發紀錄
- Java / Spring Boot
- Vue / Nuxt
- DevOps
- AI 開發
- 其他技術研究

同時也會在這個網站發布自己創作的小說。

## 第一個里程碑

目前網站使用：

- Nuxt
- Vue
- Nuxt Content
- GitHub
- Vercel

網站已經成功部署到公開網路。

## 程式碼範例

例如使用 Spring Boot 建立一個簡單的 API：

```java
@RestController
@RequestMapping("/api")
public class HelloController {

    @GetMapping("/hello")
    public String hello() {
        return "Hello World";
    }
}
```

啟動專案：

```bash
npm run dev
```

也可以在 Vue 裡使用 `ref()` 建立響應式資料。