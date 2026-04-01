# StockReview - 库存盘点工具

离线可用的仓库库存盘点 PWA 应用。工作人员用手机扫描标签二维码，补充货架号/数量/备注，最终导出 Excel 报表。

## 功能

- **二维码扫描** — 摄像头实时扫描，聚焦框引导对准，自动解析托盘号、零件号、批次号、数量
- **重复扫码检测** — 同一会话内重复托盘号自动提示，支持覆盖或新建
- **数据补录** — 扫码后填写货架号、实际盘点数量、备注
- **连续扫码** — 保存后自动恢复摄像头，快速录入
- **会话管理** — 按批次创建盘点会话，独立管理记录
- **Excel 导出** — 单会话或全部导出为 `.xlsx` 文件
- **离线可用** — PWA + Service Worker + IndexedDB，无网络也能完整使用
- **安装到桌面** — 添加到手机主屏幕，如原生应用般使用

## 二维码格式

二维码内容为逗号分隔文本：

```
数量,忽略,批次号,托盘号,零件号(空格格式)
```

示例：

```
288,2QD.407.621.A,241125,20250120010000001,2QD 407 621 A
```

| 字段 | 示例值 | 说明 |
|------|--------|------|
| 1 | `288` | 标签数量 |
| 2 | `2QD.407.621.A` | 忽略（点格式零件号） |
| 3 | `241125` | 批次号 |
| 4 | `20250120010000001` | 托盘号 |
| 5 | `2QD 407 621 A` | 零件号（空格格式） |

## 快速开始

### 本地开发

```bash
# HTTP 模式（摄像头不可用）
python -m http.server 8080

# HTTPS 模式（手机摄像头可用）
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/CN=0.0.0.0"
python -c "import http.server, ssl; s=http.server.HTTPServer(('0.0.0.0',8443),http.server.SimpleHTTPRequestHandler); s.socket=ssl.wrap_socket(s.socket,keyfile='key.pem',certfile='cert.pem',server_side=True); s.serve_forever()"
```

> 手机摄像头需要 HTTPS 或 localhost 才能工作。通过局域网 IP 用 HTTP 访问时浏览器会拒绝摄像头权限。

### Docker 部署

```bash
docker build -t stock-review .
docker run -p 80:80 stock-review
```

## 使用流程

1. 打开应用 → 新建盘点会话
2. 进入扫码页 → 摄像头对准二维码扫描
3. 自动解析数据 → 填写货架号、实际数量、备注
4. 确认保存 → 自动恢复扫码继续录入
5. 盘点完成 → 导出 Excel

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | 原生 HTML/CSS/JavaScript，零构建步骤 |
| 扫码 | jsQR + getUserMedia |
| 存储 | IndexedDB |
| 导出 | SheetJS (xlsx) |
| 离线 | Service Worker + PWA Manifest |
| 部署 | NGINX / Docker |

## 项目结构

```
├── index.html            # 单页应用入口
├── manifest.json         # PWA 配置
├── sw.js                 # Service Worker
├── css/style.css         # 样式
├── js/
│   ├── app.js            # 应用主体（路由、UI、事件）
│   ├── db.js             # IndexedDB 数据层
│   ├── scanner.js        # 摄像头扫码模块
│   ├── export.js         # Excel 导出
│   └── utils.js          # 工具函数
├── libs/                 # 第三方库（本地化）
├── icons/                # PWA 图标
├── Dockerfile            # Docker 部署
└── nginx.conf            # NGINX 配置
```
