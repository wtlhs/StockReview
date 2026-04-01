# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

仓库库存盘点 PWA 应用。工作人员用手机扫描标签二维码，补充货架号/数量/备注，最终导出 Excel。纯客户端，离线可用，零构建步骤。

## Development Commands

```bash
# 本地开发（HTTP，摄像头不可用）
python -m http.server 8080

# 本地开发（HTTPS，手机摄像头可用）
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/CN=0.0.0.0"
python -c "import http.server, ssl; s=http.server.HTTPServer(('0.0.0.0',8443),http.server.SimpleHTTPRequestHandler); s.socket=ssl.wrap_socket(s.socket,keyfile='key.pem',certfile='cert.pem',server_side=True); s.serve_forever()"

# Docker 部署
docker build -t stock-review .
docker run -p 80:80 stock-review
```

手机摄像头需要 HTTPS 或 localhost 才能工作。通过局域网 IP 用 HTTP 访问时浏览器会拒绝摄像头权限。

## Architecture

单页应用，4 个页面通过 CSS class 切换显示：

```
App (app.js)          — 页面路由、UI 事件、会话/记录管理
 ├── DB (db.js)       — IndexedDB 封装（sessions + records 两个 store）
 ├── Scanner (scanner.js) — html5-qrcode 摄像头扫码封装
 ├── ExportUtils (export.js) — SheetJS Excel 导出
 └── Utils (utils.js) — UUID、日期、QR 解析、XSS 转义
```

全局单例对象 `App`、`DB`、`Scanner`、`ExportUtils`、`Utils`，通过 script 标签按顺序加载，无模块打包。

## QR Code Data Format

二维码内容为逗号分隔文本，5 个字段中取 4 个：

```
字段1=数量, 字段2=忽略(点格式零件号), 字段3=批次号, 字段4=托盘号, 字段5=零件号(空格格式)
示例: 288,2QD.407.621.A,241125,20250120010000001,2QD 407 621 A
```

解析逻辑在 `Utils.parseQR()`。

## Key Design Decisions

- **IndexedDB 事务原子性**：`createRecord/deleteRecord/deleteSession` 在同一事务内更新关联的 `recordCount`，避免竞态
- **Scanner 生命周期**：`stop()` 是 async，必须 await 完成后再创建新实例，防止多个摄像头流同时打开
- **XSS 防御**：所有动态 HTML 使用 `Utils.esc()`（基于 `document.createElement('div').textContent`）
- **离线缓存**：Service Worker 仅缓存同源请求，libs/ 下的第三方库已下载到本地

## Data Model

**sessions store** (keyPath: `id`)：`{ id, name, createdAt, recordCount }`
**records store** (keyPath: `id`)：`{ id, sessionId, qrQuantity, partNumber, batchNumber, palletNumber, shelfNumber, actualQuantity, notes, scannedAt }`

Excel 导出列：序号、托盘号、零件号、批次号、标签数量、实际数量、货架号、备注、扫码时间、所属会话

## Production

- NGINX 反向代理，域名 `stock.wtlhs.com`
- `sw.js` 和 `manifest.json` 设置 `no-cache` 头
- 静态资源缓存 7 天
- Dockerfile: `nginx:alpine`，端口 80
