const express = require('express');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const port = 8080;  // 修改端口为8080，避免冲突

// 中间件
app.use(express.json());
app.use(cors());

// ========== 简单的异步转换队列（内存实现，适合单机/开发） ============
const jobs = {}; // jobId -> { id, status, createdAt, updatedAt, url, formatId, target, filename, outPath, error }
const queue = [];
let workerRunning = false;
const CONCURRENCY = 1; // 串行处理，保证稳定

function makeJobId() {
    return 'job-' + Date.now() + '-' + Math.floor(Math.random() * 100000);
}

// Worker: 轮询队列并执行转换任务
async function startWorker() {
    if (workerRunning) return;
    workerRunning = true;

    while (queue.length > 0) {
        const jobId = queue.shift();
        const job = jobs[jobId];
        if (!job) continue;
        job.status = 'running';
        job.updatedAt = Date.now();

        try {
            await runConvertJob(job);
            job.status = 'done';
            job.updatedAt = Date.now();
        } catch (err) {
            console.error('转换任务失败', jobId, err);
            job.status = 'error';
            job.error = err.message || String(err);
            job.updatedAt = Date.now();
        }
    }

    workerRunning = false;
}

function runConvertJob(job) {
    return new Promise((resolve, reject) => {
        const ytdlpPath = path.join(__dirname, 'yt-dlp.exe');
        const ffmpegCmd = 'ffmpeg';

        if (!fs.existsSync(ytdlpPath)) {
            return reject(new Error('yt-dlp 未安装或未放在 server 目录中'));
        }

        // 临时输出目录
        const tmpDir = path.join(__dirname, 'tmp');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

        const safeBase = job.id;
        const outTemplate = path.join(tmpDir, `${safeBase}.%(ext)s`);

        // 使用 yt-dlp 的 --merge-output-format 让 yt-dlp 在可能的情况下合并音视频为目标格式
        const target = job.target || 'mp4';
        const args = ['-f', job.formatId || 'best', '--merge-output-format', target, '-o', outTemplate, job.url];

        const opts = { maxBuffer: 1024 * 1024 * 50 };
        const child = execFile(ytdlpPath, args, opts, (error, stdout, stderr) => {
            if (error) {
                return reject(new Error('yt-dlp 执行失败: ' + (error.message || stderr || stdout)));
            }

            // yt-dlp 会创建文件，例如 tmp/<jobId>.mp4 或其他扩展名
            // 寻找 tmp/<jobId>.* 文件作为输出
            const files = fs.readdirSync(tmpDir);
            const match = files.find(f => f.startsWith(safeBase + '.'));
            if (!match) {
                return reject(new Error('未找到 yt-dlp 产出的文件'));
            }

            const outPath = path.join(tmpDir, match);
            job.outPath = outPath;
            job.updatedAt = Date.now();
            return resolve();
        });

        // 可选：监听 child.stdout/stderr 并把进度写入 job（简单实现）
        if (child && child.stderr) {
            child.stderr.on('data', (d) => {
                // ffmpeg/yt-dlp 会输出进度信息到 stderr，我们把最近一段保存到 job.progressText
                try { job.progressText = (job.progressText || '') + String(d); job.updatedAt = Date.now(); } catch (e) {}
            });
        }
    });
}

// API: 创建转换任务（异步）
app.post('/api/video/convert', (req, res) => {
    const { url, formatId, target = 'mp4', filename } = req.body || {};
    if (!url) return res.status(400).json({ error: 'url 参数缺失' });

    const id = makeJobId();
    const safeFilename = (filename || ('video_' + Date.now() + '.' + target)).replace(/[\\/<>:\"'`|?*]/g, '_');
    const job = {
        id,
        status: 'pending',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        url,
        formatId: formatId || 'best',
        target: target || 'mp4',
        filename: safeFilename,
        outPath: null,
        error: null
    };

    jobs[id] = job;
    queue.push(id);
    // 启动 worker（如未运行）
    setImmediate(() => startWorker());

    res.json({ taskId: id });
});

// API: 查询任务状态
app.get('/api/video/convert/status/:id', (req, res) => {
    const id = req.params.id;
    const job = jobs[id];
    if (!job) return res.status(404).json({ error: '任务未找到' });
    return res.json({ id: job.id, status: job.status, createdAt: job.createdAt, updatedAt: job.updatedAt, filename: job.filename, error: job.error });
});

// API: 下载已完成任务的文件
app.get('/api/video/convert/download/:id', (req, res) => {
    const id = req.params.id;
    const job = jobs[id];
    if (!job) return res.status(404).send('任务未找到');
    if (job.status !== 'done' || !job.outPath) return res.status(400).send('任务未完成或无输出文件');

    const fname = job.filename || path.basename(job.outPath);
    // 安全设置 Content-Disposition（处理非 ASCII）
    try {
        const ascii = fname.replace(/[^\x20-\x7E]/g, '_');
        res.setHeader('Content-Disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fname)}`);
    } catch (e) {
        res.setHeader('Content-Disposition', `attachment; filename="download"`);
    }
    const stat = fs.statSync(job.outPath);
    res.setHeader('Content-Length', stat.size);
    const stream = fs.createReadStream(job.outPath);
    stream.on('end', () => {
        // 可选：转换完成后删除文件或延迟删除。这里我们保留文件，管理员可自行清理。
    });
    stream.pipe(res);
});


// 解析视频信息 - 使用POST请求
app.post('/api/video/info', (req, res) => {
    const { url } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'URL参数缺失' });
    }

    // 检查URL格式
    try {
        new URL(url);
    } catch (e) {
        return res.status(400).json({ error: '无效的URL格式' });
    }

    // 首先尝试本地yt-dlp
    const ytdlpPath = path.join(__dirname, 'yt-dlp.exe'); // Windows平台
    
    if (fs.existsSync(ytdlpPath)) {
        // 使用本地yt-dlp
        execFile(ytdlpPath, ['-j', '--flat-playlist', url], { maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) {
                console.error('本地yt-dlp执行错误:', error);
                return res.status(500).json({ 
                    error: `本地yt-dlp执行错误: ${error.message}`,
                    note: '请检查yt-dlp是否正确安装'
                });
            }
            
            try {
                const videoInfo = JSON.parse(stdout);
                
                // 检查是否有可用格式
                const hasFormats = videoInfo.formats && videoInfo.formats.length > 0;
                
                res.json({
                    title: videoInfo.title || '未知标题',
                    duration: formatDuration(videoInfo.duration),
                    author: videoInfo.uploader || videoInfo.channel || '未知作者',
                    viewCount: formatViewCount(videoInfo.view_count),
                    publishDate: videoInfo.upload_date || '未知日期',
                    formats: hasFormats ? videoInfo.formats.map(format => ({
                        quality: format.format_note || format.quality || '未知质量',
                        format: format.ext || 'mp4',
                        size: format.filesize ? formatFileSize(format.filesize) : '未知大小',
                        url: '' // 实际下载链接需要单独获取
                    })).slice(0, 5) : [
                        { quality: 'best', format: 'mp4', size: '未知', url: '' },
                        { quality: '1080p', format: 'mp4', size: '未知', url: '' },
                        { quality: '720p', format: 'mp4', size: '未知', url: '' },
                        { quality: '480p', format: 'mp4', size: '未知', url: '' }
                    ],
                    thumbnail: videoInfo.thumbnail || 'https://via.placeholder.com/300x200.png?text=No+Thumbnail'
                });
            } catch (parseError) {
                console.error('解析视频信息错误:', parseError);
                res.status(500).json({ error: `解析视频信息错误: ${parseError.message}` });
            }
        });
    } else {
        // 如果本地没有yt-dlp，返回错误提示
        res.status(500).json({ 
            error: '本地yt-dlp不可用，请安装yt-dlp',
            note: '当前需要本地安装yt-dlp才能使用完整功能'
        });
    }
});

// 获取视频信息和下载链接 - 使用POST请求
app.post('/api/video/info-with-download', (req, res) => {
    const { url, quality = 'best' } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'URL参数缺失' });
    }

    // 检查URL格式
    try {
        new URL(url);
    } catch (e) {
        return res.status(400).json({ error: '无效的URL格式' });
    }

    const ytdlpPath = path.join(__dirname, 'yt-dlp.exe'); // Windows平台
    
    if (fs.existsSync(ytdlpPath)) {
        // 首先获取视频信息 - 使用 --no-playlist 而不是 --flat-playlist，获取完整的 formats 列表
        execFile(ytdlpPath, ['-j', '--no-playlist', url], { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) {
                console.error('本地yt-dlp执行错误:', error);
                return res.status(500).json({ 
                    error: `本地yt-dlp执行错误: ${error.message}`,
                    note: '请检查yt-dlp是否正确安装'
                });
            }
            
            try {
                const videoInfo = JSON.parse(stdout);
                
                // 获取有效的格式列表（取前5个）
                const hasFormats = videoInfo.formats && videoInfo.formats.length > 0;
                let selectedFormats = [];
                
                if (hasFormats) {
                    // 按文件大小排序并取前5个最大的（通常质量最高）
                    selectedFormats = videoInfo.formats
                        .filter(f => f.ext && (f.ext === 'mp4' || f.ext === 'webm'))
                        .sort((a, b) => (b.filesize || 0) - (a.filesize || 0))
                        .slice(0, 5);
                }
                
                if (selectedFormats.length === 0) {
                    // 如果没有找到合适的格式，使用默认
                    selectedFormats = [
                        { quality: 'best', format: 'mp4', size: '未知', format_id: 'best' },
                        { quality: '1080p', format: 'mp4', size: '未知', format_id: '1080p' },
                        { quality: '720p', format: 'mp4', size: '未知', format_id: '720p' },
                        { quality: '480p', format: 'mp4', size: '未知', format_id: '480p' }
                    ];
                }
                
                // 为每个格式单独获取下载链接
                let completedCount = 0;
                const downloadUrls = {};
                
                selectedFormats.forEach(format => {
                    const formatId = format.format_id || 'best';
                    
                    // 对每个格式调用 yt-dlp -g -f <format_id>
                    execFile(ytdlpPath, ['-g', '-f', formatId, url], { maxBuffer: 10 * 1024 * 1024 }, (dlError, dlStdout, dlStderr) => {
                        if (!dlError && dlStdout.trim()) {
                            // 对于某些站点（如B站），-g 可能返回多行（视频和音频分别），取第一行
                            downloadUrls[formatId] = dlStdout.trim().split('\n')[0];
                        } else {
                            console.warn(`获取格式 ${formatId} 的下载链接失败:`, dlError ? dlError.message : '无输出');
                            downloadUrls[formatId] = '';
                        }
                        
                        completedCount++;
                        
                        // 当所有格式都处理完毕后，返回结果
                        if (completedCount === selectedFormats.length) {
                            // 构建返回的 formats 列表
                            const formats = selectedFormats.map(format => {
                                const fid = format.format_id || 'best';
                                const rawUrl = downloadUrls[fid] || '';

                                // 如果下载链接为空或看起来是分段(.m4s)或包含多行（video+audio），则使用后端代理下载并合并为 mp4
                                let finalUrl = rawUrl;
                                let outFormat = format.ext || 'mp4';

                                const needsProxy = !rawUrl || rawUrl.trim() === '' || rawUrl.includes('.m4s') || rawUrl.split('\n').length > 1;
                                if (needsProxy) {
                                    // 使用后端代理接口，前端可以直接GET这个链接来触发服务器端合并并下载
                                    const encoded = encodeURIComponent(url);
                                    const encodedFid = encodeURIComponent(fid);
                                    const encTitle = encodeURIComponent(videoInfo.title || 'video');
                                    finalUrl = `http://localhost:${port}/api/video/serve?u=${encoded}&f=${encodedFid}&t=${encTitle}`;
                                    outFormat = 'mp4';
                                }

                                return {
                                    quality: format.format_note || format.quality || fid || '未知质量',
                                    format: outFormat,
                                    size: format.filesize ? formatFileSize(format.filesize) : '未知大小',
                                    url: finalUrl,
                                    format_id: fid
                                };
                            });

                            res.json({
                                title: videoInfo.title || '未知标题',
                                duration: formatDuration(videoInfo.duration),
                                author: videoInfo.uploader || videoInfo.channel || '未知作者',
                                viewCount: formatViewCount(videoInfo.view_count),
                                publishDate: videoInfo.upload_date || '未知日期',
                                formats: formats,
                                thumbnail: videoInfo.thumbnail || 'https://via.placeholder.com/300x200.png?text=No+Thumbnail'
                            });
                        }
                    });
                });
            } catch (parseError) {
                console.error('解析视频信息错误:', parseError);
                res.status(500).json({ error: `解析视频信息错误: ${parseError.message}` });
            }
        });
    } else {
        // 如果本地没有yt-dlp，返回错误提示
        res.status(500).json({ 
            error: '本地yt-dlp不可用，请安装yt-dlp',
            note: '当前需要本地安装yt-dlp才能使用完整功能'
        });
    }
});

// 获取视频下载链接 - 使用POST请求
app.post('/api/video/download', (req, res) => {
    const { url, quality = 'best' } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'URL参数缺失' });
    }

    const ytdlpPath = path.join(__dirname, 'yt-dlp.exe');
    
    if (fs.existsSync(ytdlpPath)) {
        // 使用更具体的格式参数，针对不同平台
        let args = ['-g'];
        
        // 根据URL判断视频平台并设置合适的格式参数
        if (url.includes('bilibili.com') || url.includes('b23.tv')) {
            // B站视频：使用兼容性更好的格式参数
            args.push('--format', 'bv*[ext=mp4][height<=1080]+ba[ext=m4a]/b[ext=mp4][height<=1080]/bv*+ba/b[height<=1080]/best');
        } else if (url.includes('youtube.com') || url.includes('youtu.be')) {
            // YouTube视频：获取最佳质量的mp4格式
            args.push('--format', 'best[ext=mp4][height<=1080]/best[height<=1080]/best');
        } else if (url.includes('douyin.com') || url.includes('iesdouyin.com')) {
            // 抖音视频：获取无水印视频
            args.push('--format', 'best[ext=mp4]/best');
        } else if (url.includes('tiktok.com')) {
            // TikTok视频：获取无水印视频
            args.push('--format', 'best[ext=mp4]/best');
        } else {
            // 其他平台：使用请求的格式或默认最佳格式
            args.push('--format', quality === 'best' ? 'best[ext=mp4]/best' : quality);
        }
        
        args.push(url);
        
        execFile(ytdlpPath, args, (error, stdout, stderr) => {
            if (error) {
                console.error('获取下载链接错误:', error);
                // 如果指定格式失败，尝试使用通用格式
                const fallbackArgs = ['-g', url];
                execFile(ytdlpPath, fallbackArgs, (fallbackError, fallbackStdout, fallbackStderr) => {
                    if (fallbackError) {
                        console.error('备选方案获取下载链接也失败:', fallbackError);
                        return res.status(500).json({ 
                            error: `获取下载链接错误: ${error.message}`,
                            note: '请检查视频链接是否有效或尝试其他质量选项'
                        });
                    }
                    
                    const downloadUrl = fallbackStdout.trim();
                    if (!downloadUrl) {
                        return res.status(404).json({ error: '未找到匹配的视频格式' });
                    }
                    
                    res.json({ downloadUrl });
                });
                return;
            }
            
            const downloadUrl = stdout.trim();
            if (!downloadUrl) {
                return res.status(404).json({ error: '未找到匹配的视频格式' });
            }
            
            res.json({ downloadUrl });
        });
    } else {
        // 如果本地没有yt-dlp，返回错误提示
        res.status(500).json({ 
            error: '本地yt-dlp不可用，请安装yt-dlp',
            note: '当前需要本地安装yt-dlp才能使用完整功能'
        });
    }
});

// 批量处理视频信息
app.post('/api/video/batch-info', (req, res) => {
    const { urls } = req.body;
    
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
        return res.status(400).json({ error: 'URL数组参数缺失或无效' });
    }
    
    if (urls.length > 10) {
        return res.status(400).json({ error: '单次批量处理不能超过10个链接' });
    }
    
    // 对每个URL进行处理
    const results = [];
    let completed = 0;
    
    urls.forEach(async (url, index) => {
        try {
            // 这里我们模拟批量处理，实际应该调用上面的API
            const ytdlpPath = path.join(__dirname, 'yt-dlp.exe');
            
            if (fs.existsSync(ytdlpPath)) {
                execFile(ytdlpPath, ['-j', '--flat-playlist', url], { maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
                    if (error) {
                        results[index] = { url, error: error.message, success: false };
                    } else {
                        try {
                            const videoInfo = JSON.parse(stdout);
                            results[index] = { 
                                url, 
                                info: {
                                    title: videoInfo.title || '未知标题',
                                    duration: formatDuration(videoInfo.duration),
                                    author: videoInfo.uploader || videoInfo.channel || '未知作者',
                                    viewCount: formatViewCount(videoInfo.view_count),
                                    publishDate: videoInfo.upload_date || '未知日期',
                                    formats: [
                                        { quality: 'best', format: 'mp4', size: '未知', url: '' },
                                        { quality: '1080p', format: 'mp4', size: '未知', url: '' },
                                        { quality: '720p', format: 'mp4', size: '未知', url: '' }
                                    ],
                                    thumbnail: videoInfo.thumbnail || 'https://via.placeholder.com/300x200.png?text=No+Thumbnail'
                                }, 
                                success: true 
                            };
                        } catch (parseError) {
                            results[index] = { url, error: parseError.message, success: false };
                        }
                    }
                    
                    completed++;
                    if (completed === urls.length) {
                        res.json({ results });
                    }
                });
            } else {
                results[index] = { url, error: '本地yt-dlp不可用', success: false };
                completed++;
                if (completed === urls.length) {
                    res.json({ results });
                }
            }
        } catch (error) {
            results[index] = { url, error: error.message, success: false };
            completed++;
            if (completed === urls.length) {
                res.json({ results });
            }
        }
    });
});

// 格式化时长
function formatDuration(seconds) {
    if (!seconds) return '未知';
    
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hrs > 0) {
        return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// 格式化观看次数
function formatViewCount(count) {
    if (!count) return '未知';
    
    if (count >= 1000000) {
        return `${(count / 1000000).toFixed(1)}M`;
    }
    if (count >= 1000) {
        return `${(count / 1000).toFixed(1)}K`;
    }
    return count ? count.toString() : '未知';
}

// 格式化文件大小
function formatFileSize(bytes) {
    if (!bytes) return '未知';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

app.listen(port, () => {
    console.log(`视频服务运行在 http://localhost:${port}`);
    console.log(`支持的API端点:`);
    console.log(`  POST /api/video/info - 获取视频信息`);
    console.log(`  POST /api/video/download - 获取下载链接`);
    console.log(`  POST /api/video/batch-info - 批量获取视频信息`);
    console.log(`请确保yt-dlp已安装在系统中或放置在server目录中`);
});

// 代理下载并合并为 mp4（GET）
app.get('/api/video/serve', (req, res) => {
    const { u: encodedUrl, f: formatId, t: title } = req.query;
    if (!encodedUrl) return res.status(400).send('缺少参数 u');

    const url = decodeURIComponent(encodedUrl);
    const fid = formatId ? decodeURIComponent(formatId) : 'best';
    const outTitle = title ? decodeURIComponent(title) : 'video';

    try {
        new URL(url);
    } catch (e) {
        return res.status(400).send('无效的 URL');
    }

    const ytdlpPath = path.join(__dirname, 'yt-dlp.exe');
    if (!fs.existsSync(ytdlpPath)) {
        return res.status(500).send('服务器缺少 yt-dlp');
    }

    // 确保临时目录存在
    const tmpDir = path.join(__dirname, 'tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

    const id = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    const outTemplate = path.join(tmpDir, `${id}.%(ext)s`);

    // 使用 yt-dlp 下载并合并（需要 ffmpeg 可用）
    const args = ['-f', fid, '--merge-output-format', 'mp4', '-o', outTemplate, url];

    execFile(ytdlpPath, args, { maxBuffer: 50 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) {
            console.error('代理下载失败:', err, stderr);
            return res.status(500).send('代理下载失败: ' + (err.message || '未知错误'));
        }

        // 找到生成的文件
        const files = fs.readdirSync(tmpDir).filter(n => n.startsWith(id + '.'));
        if (files.length === 0) {
            console.error('未找到下载输出文件，yt-dlp 输出:', stdout, stderr);
            return res.status(500).send('未生成下载文件');
        }

        const filePath = path.join(tmpDir, files[0]);
        const stat = fs.statSync(filePath);

        try {
            res.setHeader('Content-Type', 'video/mp4');

            // 构造安全的文件名：去除文件系统和 header 不允许的字符
            const safeName = `${outTitle.replace(/[<>:"/\\|?*]/g, '_')}.mp4`;
            // ASCII 版本用于 filename（避免 header 中出现非 ASCII 导致 ERR_INVALID_CHAR）
            const asciiName = safeName.replace(/[^\x20-\x7E]/g, '_');
            const encodedName = encodeURIComponent(safeName);

            // 同时提供 filename 和 filename*（UTF-8）以兼容不同浏览器/客户端
            res.setHeader('Content-Disposition', `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`);
            res.setHeader('Content-Length', stat.size);
        } catch (hdrErr) {
            console.error('设置响应头失败:', hdrErr);
            // 回退为通用二进制响应头，防止服务器崩溃
            try { res.setHeader('Content-Type', 'application/octet-stream'); } catch (e) { /* ignore */ }
        }

        const stream = fs.createReadStream(filePath);
        stream.pipe(res);

        stream.on('end', () => {
            // 延迟删除文件
            setTimeout(() => {
                try { fs.unlinkSync(filePath); } catch (e) { /* ignore */ }
            }, 2000);
        });

        stream.on('error', (streamErr) => {
            console.error('流式传输错误:', streamErr);
            res.end();
        });
    });
});