---
title: Spring Boot 使用 @RestControllerAdvice 統一處理 API 例外
description: 介紹如何使用 Spring Boot 的 @RestControllerAdvice 與 @ExceptionHandler，建立統一的 REST API 例外處理機制。
date: 2026-09-03T14:45:00+08:00
category: Java
tags:
  - Java
  - Spring Boot
  - REST API
  - Exception Handling
---

# Spring Boot 使用 @RestControllerAdvice 統一處理 API 例外

在 REST API 開發中，Controller 或 Service 執行過程難免會發生例外。

如果每個 Controller 都各自使用 `try-catch` 處理，不只會產生大量重複程式碼，也很難維持一致的 API Response 格式。

Spring Boot 可以透過 `@RestControllerAdvice` 搭配 `@ExceptionHandler`，將例外處理集中管理。

## 問題背景

假設我們有一個查詢使用者的 API：

```java
@RestController
@RequestMapping("/api/users")
public class UserController {

    @GetMapping("/{id}")
    public UserResponse getUser(@PathVariable Long id) {

        if (id == 1L) {
            throw new RuntimeException("找不到使用者");
        }

        return new UserResponse(id, "MYBB");
    }
}
```

當程式發生例外時，如果沒有額外處理，Spring Boot 會使用預設的錯誤處理機制。

但實際專案通常希望 API 的錯誤格式保持一致，例如：

```json
{
  "code": "USER_NOT_FOUND",
  "message": "找不到使用者"
}
```

因此需要建立統一的 Exception Handler。

## 建立錯誤 Response

首先建立一個專門回傳錯誤資訊的物件：

```java
public class ErrorResponse {

    private String code;
    private String message;

    public ErrorResponse(String code, String message) {
        this.code = code;
        this.message = message;
    }

    public String getCode() {
        return code;
    }

    public String getMessage() {
        return message;
    }
}
```

之後所有 API 發生錯誤時，都可以使用相同格式回傳。

## 建立自訂 Exception

接著建立一個自訂例外：

```java
public class UserNotFoundException extends RuntimeException {

    public UserNotFoundException(String message) {
        super(message);
    }
}
```

Controller 或 Service 找不到使用者時，就可以：

```java
throw new UserNotFoundException("找不到使用者");
```

相比直接丟出：

```java
throw new RuntimeException("找不到使用者");
```

使用自訂 Exception 可以更清楚表達錯誤的業務語意，也方便後續進行不同的例外處理。

## 使用 @RestControllerAdvice

建立全域 Exception Handler：

```java
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(UserNotFoundException.class)
    public ResponseEntity<ErrorResponse> handleUserNotFound(
            UserNotFoundException ex) {

        ErrorResponse response = new ErrorResponse(
                "USER_NOT_FOUND",
                ex.getMessage()
        );

        return ResponseEntity
                .status(HttpStatus.NOT_FOUND)
                .body(response);
    }
}
```

這裡有兩個重要 Annotation：

```text
@RestControllerAdvice
```

負責讓這個 Class 可以集中處理多個 Controller 發生的例外。

而：

```text
@ExceptionHandler(UserNotFoundException.class)
```

表示當 Spring 捕捉到 `UserNotFoundException` 時，就交給這個 Method 處理。

## 修改 Controller

Controller 就不需要自己處理 Exception：

```java
@RestController
@RequestMapping("/api/users")
public class UserController {

    @GetMapping("/{id}")
    public UserResponse getUser(@PathVariable Long id) {

        if (id == 1L) {
            throw new UserNotFoundException("找不到使用者");
        }

        return new UserResponse(id, "MYBB");
    }
}
```

Controller 的責任變得單純：

```text
HTTP Request
      ↓
Controller
      ↓
執行業務流程
      ↓
發生 Exception
      ↓
GlobalExceptionHandler
      ↓
統一 Error Response
```

## API 回傳結果

呼叫：

```text
GET /api/users/1
```

會得到 HTTP Status：

```text
404 Not Found
```

Response Body：

```json
{
  "code": "USER_NOT_FOUND",
  "message": "找不到使用者"
}
```

這樣前端就可以根據：

```text
HTTP Status
code
message
```

統一處理 API 錯誤。

## 處理其他未預期 Exception

除了業務 Exception，也可以建立最後一道防線：

```java
@ExceptionHandler(Exception.class)
public ResponseEntity<ErrorResponse> handleException(
        Exception ex) {

    ErrorResponse response = new ErrorResponse(
            "SYSTEM_ERROR",
            "系統發生錯誤"
    );

    return ResponseEntity
            .status(HttpStatus.INTERNAL_SERVER_ERROR)
            .body(response);
}
```

這樣沒有被其他 Handler 處理的 Exception，最後會回傳：

```json
{
  "code": "SYSTEM_ERROR",
  "message": "系統發生錯誤"
}
```

實際專案中，這類未知錯誤通常還需要寫入 Log，方便後續追查問題。

同時不建議直接把 Exception 的完整內容或 Stack Trace 回傳給前端，以避免暴露系統內部資訊。

## 小結

Spring Boot REST API 的例外處理可以整理成：

```text
Controller / Service
        ↓
throw Exception
        ↓
@RestControllerAdvice
        ↓
@ExceptionHandler
        ↓
ErrorResponse
        ↓
HTTP Response
```

使用全域 Exception Handler 的主要好處是：

- Controller 不需要大量 `try-catch`
- API 錯誤格式可以統一
- HTTP Status 可以集中管理
- 業務 Exception 與系統 Exception 可以分開處理
- 後續更容易加入 Logging、Validation 等機制

對 REST API 專案而言，統一的 Exception Handling 通常會是基礎架構的一部分，而不是由每個 Controller 各自處理。