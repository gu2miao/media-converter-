# 媒体文件提取与格式转换器 - 安装说明

## 系统要求

- Node.js (v14.0 或更高版本)
- Windows/macOS/Linux 操作系统
- 网络连接（用于访问视频网站）

## 安装步骤

### 1. 安装 Node.js

首先确保您的系统已安装 Node.js：

- 访问 [Node.js 官网](https://nodejs.org/)
- 下载并安装最新 LTS 版本

验证安装：
```bash
node --version
npm --version
```

### 2. 安装 yt-dlp

#### Windows 用户：
1. 访问 [yt-dlp releases 页面](https://github.com/yt-dlp/yt-dlp/releases)
2. 下载最新的 `yt-dlp.exe` 文件
3. 将文件重命名为 `yt-dlp.exe` 并复制到 `media-converter` 项目根目录

#### macOS 用户：
```bash
brew install yt-dlp
```

#### Linux 用户：
```bash
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
```

### 3. 下载项目文件

将项目文件下载到本地计算机。

### 4. 安装项目依赖

在项目根目录打开终端或命令提示符，运行：

```bash
cd media-converter/server
npm install
```

### 5. 启动后端服务

在 `media-converter/server` 目录中运行：

```bash
npm start
```

服务将启动在 `http://localhost:3000`

### 6. 运行前端应用

直接在浏览器中打开 `index.html` 文件即可使用。

## 功能验证

### 测试视频提取功能：

1. 确保后端服务已启动
2. 打开浏览器并访问 `index.html`
3. 选择"视频下载"功能
4. 输入一个视频链接（如 Bilibili 或 YouTube 链接）
5. 点击"解析视频"按钮
6. 等待视频信息加载完成

如果一切正常，您应该能看到视频标题、时长、作者等信息以及下载选项。

## 常见问题

### 1. 后端服务无法启动

检查是否已正确安装 Node.js 和项目依赖：
```bash
cd server
npm install
npm start
```

### 2. API 请求失败

- 检查后端服务是否在 `http://localhost:3000` 运行
- 确认 yt-dlp 是否已正确安装
- 检查防火墙设置

### 3. 视频链接无法解析

- 确认视频链接是否有效
- 检查视频网站是否支持（当前支持 Bilibili、YouTube、抖音等）

## 注意事项

- 请遵守视频网站的使用条款
- 仅用于个人学习和合法用途
- 部分网站可能需要登录或有其他访问限制
- 尊重开发者资源，不要进行大量并发请求

## 项目结构

```
media-converter/
├── css/
│   └── style.css
├── js/
│   ├── modules/
│   │   ├── videoExtractor.js
│   │   ├── formatConverter.js
│   │   └── fileUploader.js
│   └── main.js
├── server/
│   ├── video-service.js
│   └── package.json
├── index.html
├── README.md
└── INSTALL.md
```