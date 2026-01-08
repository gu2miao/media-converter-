# 视频提取服务

这是一个基于Node.js的后端服务，用于提供真实的视频提取功能。

## 安装依赖

```bash
npm install
```

## 安装yt-dlp

### Windows
1. 下载 yt-dlp.exe 文件：
   - 从 [yt-dlp releases](https://github.com/yt-dlp/yt-dlp/releases) 下载最新版本
   - 将其重命名为 `yt-dlp.exe` 并放置在 `server` 目录中

### macOS
```bash
brew install yt-dlp
```

### Linux
```bash
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
```

## 启动服务

```bash
npm start
```

或者在开发模式下：

```bash
npm run dev
```

## API接口

### 获取视频信息
```
GET /api/video/info?url=<视频链接>
```

### 获取下载链接
```
GET /api/video/download?url=<视频链接>&quality=<视频质量>
```

## 前端集成

需要修改前端的 `videoExtractor.js` 模块，将请求发送到后端服务。

## 注意事项

- 请遵守视频网站的使用条款
- 仅用于个人学习和合法用途
- 部分网站可能需要登录或有其他访问限制