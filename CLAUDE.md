# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

离线可用的仓库库存盘点 PWA 应用。工作人员用手机扫描标签二维码，补充货架号/数量/批次号/发票号/备注，最终导出 Excel 报表。纯客户端应用，无后端。

## Development Commands

```bash
# 本地开发（HTTP 模式，摄像头不可用）
python -m http.server 8080

# HTTPS 模式（手机摄像头可用，需要 HTTPS 或 localhost）
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/CN=0.0.0.0"
python -c "import http.server, ssl; s=http.server.HTTPServer(('0.0.0.0',8443),http.server.SimpleHTTPRequestHandler); s.socket=ssl.wrap_socket(s.socket,keyfile='key.pem',certfile='cert.pem',server_side=True); s.serve_forever()"

# Docker 部署
docker build -t stock-review .
docker run -p 80:80 stock-review
```

无构建步骤、无包管理器、无测试框架。零依赖纯静态文件项目。

## Architecture

### 技术栈

原生 HTML/CSS/JavaScript，零构建步骤。所有第三方库本地化在 `libs/` 目录。

### 数据流

```
二维码 → jsQR 解码 → Utils.parseQR() 解析字段 → 用户补录表单 → IndexedDB 持久化 → SheetJS 导出 Excel
```

### 模块职责

| 模块 | 职责 |
|------|------|
| `js/utils.js` — `Utils` | ID 生成、日期格式化、HTML 转义防 XSS、QR 文本解析、正整数解析 |
| `js/db.js` — `DB` | IndexedDB 封装，两个 Object Store：`sessions` 和 `records`（通过 `sessionId` 索引关联）。计数更新在同一事务中完成保证原子性 |
| `js/scanner.js` — `Scanner` | 原生 `getUserMedia` + canvas 帧捕获 + jsQR 解码。包含聚焦框覆盖层（CSS box-shadow 遮罩）和 1.5s 防抖 |
| `js/export.js` — `ExportUtils` | SheetJS 封装导出 xlsx。优先使用 Web Share API（PWA 独立模式可保存到文件），回退到传统 `<a download>` 下载 |
| `js/app.js` — `App` | 单页路由（4 个 page div 切换 `.active` 类）、会话/记录 CRUD UI、重复扫码检测、Service Worker 注册与更新 |

### 页面路由

单页应用，通过 `showPage()` 切换 `.page.active` 类实现：

- `page-home` — 会话列表
- `page-session` — 单个会话的记录列表
- `page-scanner` — 摄像头扫码 + 补录表单
- `page-edit` — 编辑已有记录

### 二维码格式

逗号分隔文本，5 个字段，字段 2 忽略：
```
数量,忽略(点格式零件号),批次号,托盘号,零件号(空格格式)
288,2QD.407.621.A,241125,20250120010000001,2QD 407 621 A
```
解析逻辑在 `Utils.parseQR()`。

### Service Worker 缓存策略

- `sw.js` 中 `VERSION` 变量控制缓存版本，**每次修改任何前端文件后必须递增**
- 导航请求：network-first（确保最新页面）
- 静态资源：cache-first（离线可用）
- `ASSETS` 数组列出所有需预缓存的文件路径

### IndexedDB Schema

- **sessions** store: `id`(keyPath), `name`, `createdAt`, `recordCount`。索引：`createdAt`
- **records** store: `id`(keyPath), `sessionId`, `qrQuantity`, `partNumber`, `batchNumber`, `palletNumber`, `shelfNumber`, `actualQuantity`, `invoiceNumber`, `notes`, `scannedAt`。索引：`sessionId`, `scannedAt`

## Key Conventions

- 所有 UI 字符串和注释为中文
- HTML 转义统一使用 `Utils.esc()` 防 XSS
- 全局单例对象模式：`Utils`、`DB`、`Scanner`、`ExportUtils`、`App`
- 第三方库（jsQR、SheetJS）本地化在 `libs/`，不使用 CDN
- 摄像头需要 HTTPS 或 localhost 环境
- PWA 安全区域：header/page/toast/fab 使用 `env(safe-area-inset-*)` 适配刘海屏
- 刷新按钮使用 `onclick` 内联绑定（安卓独立模式下 addEventListener 可能不触发）
- 货架号为选填字段，批次号可编辑（扫码自动填充后用户可修改），发票号为新增选填字段
