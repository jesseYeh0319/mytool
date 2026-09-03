---
title: 使用 Spring Boot 建立 REST API
description: 記錄使用 Spring Boot 建立一個基本 REST API 的方式。
date: 2026-09-02T20:00:00+08:00
category: Java
tags:
  - Java
  - Spring Boot
  - REST API
image: /images/tech/spring-boot-rest-api.webp
---

# 使用 Spring Boot 建立 REST API

這篇文章記錄如何使用 Spring Boot 建立一個簡單的 REST API。

## 建立 Controller

在 Spring Boot 中，可以使用 `@RestController` 建立 REST Controller。

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

啟動 Spring Boot Application 後，可以透過：

```text
GET /api/hello
```

取得：

```text
Hello World
```

## 回傳 JSON

實際開發 API 時，通常不會只回傳字串，而是回傳物件。

例如：

```java
public class UserResponse {

    private Long id;
    private String name;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }
}
```

Controller：

```java
@GetMapping("/user")
public UserResponse getUser() {

    UserResponse user = new UserResponse();

    user.setId(1L);
    user.setName("MYBB");

    return user;
}
```

Spring Boot 會透過 Jackson 自動把 Java Object 轉成 JSON：

```json
{
  "id": 1,
  "name": "MYBB"
}
```

## 小結

一個最基本的 Spring Boot REST API 流程可以理解成：

```text
HTTP Request
      ↓
Controller
      ↓
Java Object
      ↓
Jackson
      ↓
JSON Response
```

之後可以再繼續加入 Service、Repository、Database，形成完整的後端架構。