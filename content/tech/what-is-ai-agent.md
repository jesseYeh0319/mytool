---
title: "什麼是 AI Agent？從對話到自主執行任務"
description: "完整介紹 AI Agent 的核心概念、運作流程、工具使用、Agent Loop，以及它與 Chatbot、Workflow、Multi-Agent 的差異。"
date: 2026-09-11T16:31:07+08:00
category: "AI"
tags:
  - "AI Agent"
  - "人工智慧"
  - "自動化"
---

# 什麼是 AI Agent？從對話到自主執行任務

## 問題背景

目前業界所說的 **AI Agent（AI 代理／智慧代理）**，可以先用一句話理解：

> AI Agent 不是只會回答問題的 AI，而是能拿著一個目標，自己持續判斷下一步、呼叫工具、檢查結果，再繼續做到任務完成的系統。

傳統聊天型 AI 的互動通常是：

```text
使用者提出問題
↓
AI 回答
↓
結束
```

但 Agent 的運作方式更接近：

```text
使用者提供目標
↓
AI 判斷下一步
↓
使用工具
↓
取得結果
↓
重新判斷
↓
繼續行動
↓
直到完成目標
```

真正重要的差異，不只是 AI 能不能使用工具，而是它是否能在一個持續的迴圈中，自主決定下一步要做什麼。

可以把 Agent 的核心概念簡化成：

```text
LLM + Tools + Loop
```

更完整則可以表示成：

```text
Agent
≈
LLM
+ Goal
+ Tools
+ State / Memory
+ Loop
+ Guardrails
```

---

## 原因分析

### 1. 傳統 Chatbot 主要負責回答

一般聊天型 AI 的典型流程是：

```text
你問一句
↓
AI 回一句
```

例如：

```text
使用者：
幫我找出這段 Java 程式的 SQL Injection。

AI：
請把程式碼貼給我，我幫你分析。
```

AI 本身不會主動：

- 打開專案
- 搜尋檔案
- 執行指令
- 修改程式碼
- 執行測試
- 根據錯誤重新修正

它主要負責的是「產生回答」。

---

### 2. Workflow 的流程通常是工程師預先寫好的

例如：

```text
讀 Excel
↓
轉 JSON
↓
呼叫 API
↓
寫入資料庫
↓
寄 Email
```

即使其中某一步使用 LLM，整個流程仍然可能只是一般 Workflow。

例如：

```java
step1();
step2();
step3();

if (failed) {
    step4();
}
```

下一步要做什麼，是開發者事先寫死的。

因此：

```text
Workflow
→ 程式決定流程

Agent
→ LLM 動態決定流程
```

這是非常重要的差異。

---

### 3. Agent 的核心是 Agent Loop

Agent 最重要的機制，是反覆執行：

```text
Observe
↓
Think / Decide
↓
Act
↓
Observe
↓
Think / Decide
↓
Act
↓
...
```

也就是：

1. 觀察目前狀態
2. 判斷下一步
3. 使用工具
4. 查看工具結果
5. 根據結果重新判斷
6. 持續直到完成目標

如果用程式概念表示，大致可以寫成：

```java
while (!goalCompleted) {

    Context context = observeEnvironment();

    Action action = llm.decide(
        goal,
        context,
        history,
        availableTools
    );

    Result result = execute(action);

    history.add(result);
}
```

這個迴圈其實就是 Agent 的核心。

---

## 解決方式

要真正理解 AI Agent，可以把它拆成六個主要部分。

### 1. Goal：目標

Agent 首先需要知道：

```text
我要完成什麼？
```

例如：

```text
找出 Spring Boot 專案中的 SQL Injection，
修正它，
並確認測試可以通過。
```

這跟一般 Prompt 不太一樣。

一般 Chatbot 常是在回答問題，而 Agent 接收到的是一個「任務」。

---

### 2. Model：大腦

Agent 的決策中心通常是一個大型語言模型，例如：

```text
GPT
Claude
Gemini
其他 LLM
```

模型負責判斷：

```text
現在發生什麼？
下一步應該做什麼？
要使用哪個工具？
工具回傳的結果代表什麼？
任務完成了嗎？
```

---

### 3. Tools：工具

如果 AI 只有語言模型，它實際上什麼都做不了。

因此 Agent 通常會擁有工具，例如：

```text
Web Search
Browser
API
MCP
Database
Filesystem
Shell
Git
Email
Slack
Jira
Calendar
```

假設 Agent 要修 Spring Boot 專案，可能需要：

```text
讀取檔案
搜尋程式碼
修改檔案
執行 mvn test
查看錯誤
執行 git diff
```

LLM 負責決策，而工具負責真正執行。

---

### 4. State / Memory：狀態與記憶

Agent 必須知道自己目前做到哪裡。

例如：

```text
目標：
修掉 SQL Injection

已完成：
找到 UserRepository.java
找到 SQL 字串拼接
改成 PreparedStatement

目前問題：
mvn test 失敗

錯誤：
缺少 import

下一步：
修正 import
```

這些資訊就是 Agent 的 State。

更進階的 Agent 還可能有：

```text
短期記憶
長期記憶
任務歷史
使用者偏好
過去執行結果
```

---

### 5. Loop：持續執行

假設你要求：

```text
幫我找出這個 Spring Boot 專案的 SQL Injection 並修掉。
```

Coding Agent 可能自己完成：

```text
目標：
找到 SQL Injection 並修正

↓
查看專案目錄

↓
搜尋
Statement
createNativeQuery
executeQuery
SQL 字串拼接

↓
找到 UserRepository.java

↓
讀取檔案

↓
分析資料流

↓
修改成 PreparedStatement

↓
執行 mvn test

↓
測試失敗

↓
讀取錯誤訊息

↓
發現 import 問題

↓
修正

↓
再次執行 mvn test

↓
PASS

↓
整理修改內容並回報
```

使用者只提供：

```text
Goal
```

Agent 自己決定：

```text
Step 1
Step 2
Step 3
...
```

這就是 Agentic Behavior。

---

### 6. Guardrails：權限與限制

Agent 能自主行動，同時也代表風險更高。

因此實務上通常會設定限制，例如：

```text
可以讀資料庫
不可以刪資料庫

可以建立 Git Commit
不可以直接 Merge

可以產生 Email 草稿
寄出前需要人工確認

可以修改程式碼
部署 Production 前需要人工批准
```

因此真正的 Agent 系統通常不是追求「完全自主」，而是追求：

```text
在允許的範圍內自主完成任務。
```

---

## 驗證結果

### Chatbot、Workflow、Agent 的差異

可以用下面這張表快速判斷：

| 類型 | 下一步由誰決定 | 是否使用工具 | 是否會根據結果調整 |
|---|---|---|---|
| Chatbot | 使用者 | 不一定 | 通常不會 |
| Workflow | 程式設計師 | 可以 | 依預先規則 |
| Agent | LLM | 通常會 | 會 |
| Multi-Agent | 多個 Agent | 通常會 | 會 |

最重要的判斷方式是：

```text
下一步是程式寫死的，
還是 LLM 根據目前狀況動態決定？
```

---

### LLM + Tool 不一定等於 Agent

例如：

```text
使用者：
台北天氣如何？

LLM：
call getWeather("Taipei")

API：
28°C

LLM：
台北目前 28°C
```

這比較像：

```text
LLM + Tool
```

它只做一次工具呼叫，不一定需要稱為 Agent。

但是如果使用者說：

```text
幫我安排週末兩天一夜旅行。

條件：
預算 8,000 元
不要下雨
住宿評價至少 4.3
安排交通、住宿與景點
```

Agent 可能自己：

```text
查天氣
↓
淘汰下雨地區
↓
搜尋住宿
↓
比較價格
↓
查交通
↓
發現火車時間不合理
↓
修改行程
↓
計算總預算
↓
發現超支
↓
更換住宿
↓
重新計算
↓
產出最終行程
```

這就非常符合 Agent 的概念。

因為它具備：

```text
目標
+
工具
+
多步驟決策
+
結果回饋
+
策略調整
```

---

### 如何判斷一個產品是不是真的 Agent

看到某個產品宣稱：

```text
我們是 AI Agent。
```

可以直接問四個問題：

```text
1. 它的 Goal 是什麼？

2. 它有哪些 Tools？

3. 下一步是程式寫死，
   還是 LLM 自己決定？

4. 執行失敗之後，
   它會不會根據結果修改策略並重試？
```

如果答案是：

```text
LLM 自己決定下一步
+
可以使用工具
+
可以觀察工具結果
+
可以根據結果改變策略
+
持續直到完成目標
```

基本上就符合目前常說的 AI Agent。

---

### Multi-Agent 是什麼

Multi-Agent 只是把一個 Agent 拆成多個角色。

例如：

```text
                 Manager Agent
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
    Research Agent  Coding Agent  Review Agent
          │            │            │
          └────────────┼────────────┘
                       ▼
                    Result
```

Manager Agent 可能負責：

```text
拆分任務
分配任務
收集結果
判斷結果是否合格
決定是否重新執行
```

但 Multi-Agent 不代表一定比較好。

很多問題使用：

```text
Single Agent
```

甚至：

```text
固定 Workflow + LLM
```

就已經足夠。

Agent 越多，通常也代表：

```text
成本更高
延遲更高
除錯更困難
錯誤更容易互相傳遞
系統更難控制
```

因此不應該為了「Agent」這個名稱而刻意把系統做複雜。

---

## 注意事項

### 1. Agent 不等於完全自主 AI

目前大部分實際使用的 Agent，都還是在明確限制下工作。

更準確的理解是：

```text
有限自主
```

而不是：

```text
完全自主
```

例如 Coding Agent 可以修改專案，但可能沒有 Production 部署權限。

---

### 2. Tool Calling 不等於 Agent

只會呼叫一次 Function 或 API：

```text
LLM
↓
API
↓
回答
```

通常只能稱為 Tool Use。

真正 Agent 更接近：

```text
LLM
↓
Tool
↓
Result
↓
LLM
↓
Tool
↓
Result
↓
LLM
↓
...
```

因此關鍵不是「有沒有工具」，而是有沒有：

```text
Loop
```

---

### 3. Agent 最難的地方通常不是 Prompt

真正做 Agent 系統時，困難通常會落在：

```text
Context Management
Memory
Tool Design
Permission
Error Handling
Retry
Observability
Evaluation
Cost
Latency
```

也就是 Agent 如何知道：

```text
自己現在做到哪？
工具失敗怎麼辦？
什麼時候該重試？
什麼時候該停止？
結果到底好不好？
```

這些通常比單純寫 Prompt 更重要。

---

### 4. MCP、CLI、Skill、Subagent、Hook 都可以放回 Agent 架構理解

這些最近常見的名詞其實不是互不相關。

可以這樣理解：

```text
LLM
→ 腦

MCP / API
→ 外部工具介面

CLI
→ 執行能力

Skill
→ 可複用能力

Memory
→ 狀態與長期記憶

Subagent
→ 任務分工

Hook
→ 事件與流程控制

Eval
→ 判斷 Agent 做得好不好

Agent
→ 把這些能力組合起來並持續運作的系統
```

因此如果要理解目前整個 Agent 生態，可以從這張關係開始。

---

## 小結

AI Agent 最核心的概念不是「AI 可以回答更多問題」，而是：

> AI 可以為了完成一個目標，自主決定下一步，使用工具執行，觀察結果，再持續修正行動。

可以記住這個公式：

```text
Agent
≈
LLM
+ Goal
+ Tools
+ State / Memory
+ Loop
+ Guardrails
```

其中最關鍵的是：

```text
LLM + Tools + Loop
```

判斷一個系統是否真的接近 Agent，可以問：

```text
它是不是只回答問題？

還是它會：

理解目標
↓
決定下一步
↓
使用工具
↓
取得結果
↓
根據結果修改策略
↓
繼續執行
↓
直到完成？
```

如果是後者，它基本上就是目前所說的 **AI Agent**。

對工程師而言，理解 Agent 最有效的方法，不是先學 LangChain、CrewAI 或其他框架，而是自己實作一次最基本的：

```text
LLM
↓
Tool Call
↓
Execute
↓
Result
↓
LLM
```

只要親手完成一次這個 Agent Loop，AI Agent 的核心概念就會非常清楚。
