// 媒体文件提取与格式转换器主脚本
document.addEventListener('DOMContentLoaded', function() {
    // 初始化页面
    initializeApp();
});

// 后端 API 基础地址：优先使用 VideoExtractor 提供的 BASE_URL，否则默认本地 8080
const API_BASE = (typeof VideoExtractor !== 'undefined' && VideoExtractor.BASE_URL) ? VideoExtractor.BASE_URL : 'http://localhost:8080';

// 全局模式标记
let isBase64ToImageMode = false;
let isBatchMode = false;

function initializeApp() {
    console.log('[mc] initializeApp start');
    try {
        initializeUploadAreas();
    } catch (e) { console.warn('initializeUploadAreas failed', e); }

    // 侧边导航切换
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(a => a.addEventListener('click', (ev) => {
        ev.preventDefault();
        navItems.forEach(n => n.classList.remove('active'));
        a.classList.add('active');
        const fn = a.getAttribute('data-function');
        document.querySelectorAll('.function-panel').forEach(p => p.classList.remove('active'));
        const panel = document.getElementById(fn + '-panel');
        if (panel) panel.classList.add('active');
    }));

    // 视频面板常用按钮
    const pasteUrlBtn = document.getElementById('paste-url-btn'); if (pasteUrlBtn) pasteUrlBtn.addEventListener('click', pasteUrlFromClipboard);
    const clearUrlBtn = document.getElementById('clear-url-btn'); if (clearUrlBtn) clearUrlBtn.addEventListener('click', clearVideoUrl);
    const switchBatchBtn = document.getElementById('switch-batch-btn'); if (switchBatchBtn) switchBatchBtn.addEventListener('click', switchBatchMode);
    const downloadVideoBtn = document.getElementById('download-video-btn'); if (downloadVideoBtn) downloadVideoBtn.addEventListener('click', downloadVideo);
    const parseBatchBtn = document.getElementById('parse-batch-btn'); if (parseBatchBtn) parseBatchBtn.addEventListener('click', parseBatchVideos);

    // 其余面板按钮映射
    const mappings = [
        ['convert-image-btn', convertImages], ['paste-image-btn', () => pasteFromClipboard('image')], ['clear-image-btn', () => clearUploadArea('image')],
        ['convert-video-btn', convertVideos], ['paste-video-btn', () => pasteFromClipboard('video')], ['clear-video-btn', () => clearUploadArea('video')],
        ['convert-audio-btn', convertAudios], ['paste-audio-btn', () => pasteFromClipboard('audio')], ['clear-audio-btn', () => clearUploadArea('audio')],
        ['process-btn', handleImageBase64Conversion], ['switch-mode-btn', switchConversionMode], ['copy-base64-btn', copyBase64ToClipboard]
    ];
    mappings.forEach(([id, fn]) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); });

    // 初始 UI 状态
    isBatchMode = false; const batchInputArea = document.getElementById('batch-input-area'); if (batchInputArea) batchInputArea.style.display = 'none';
}

// 全局捕获按钮点击，阻止没有显式 type 或 type='submit' 的按钮触发表单默认提交（避免刷新）
document.addEventListener('click', function(e) {
    try {
        const t = e.target;
        if (!t) return;
        // 仅对 <button> 元素处理，保留 a 标签和 programmatic clicks 的默认行为
        if (t.tagName && t.tagName.toLowerCase() === 'button') {
            const type = t.getAttribute('type');
            if (!type || type.toLowerCase() === 'submit') {
                console.warn('Prevented default for button click:', t, 'typeAttr:', type);
                e.preventDefault();
            }
        }
    } catch (err) {
        // 不要打断正常流程
        console.warn('global click handler error:', err);
    }
}, true);

 
function initializeUploadAreas() {
    // 图片上传区域
    setupUploadAreaWithPreview('image-upload-area', 'image-upload', 'image');
    
    // 视频上传区域
    setupUploadAreaWithPreview('video-upload-area', 'video-upload', 'video');
    
    // 音频上传区域
    setupUploadAreaWithPreview('audio-upload-area', 'audio-upload', 'audio');
    
    // 图片转Base64上传区域
    setupUploadAreaWithPreview('image-upload-area-base64', 'base64-upload', 'base64');
    
    // 初始化粘贴功能
    FileUploader.initPasteFunctionality(handlePaste);
}

// 设置上传区域并显示预览
function setupUploadAreaWithPreview(areaId, inputId, type) {
    const uploadArea = document.getElementById(areaId);
    const fileInput = document.getElementById(inputId);
    
    if (uploadArea && fileInput) {
        // 点击上传区域触发文件选择
        uploadArea.addEventListener('click', (e) => {
            // 如果点击的是预览文件的删除按钮，则不触发文件选择
            if (e.target.classList.contains('delete-file-btn')) {
                const fileItem = e.target.closest('.file-item');
                removeFileFromInput(fileInput, fileItem);
                fileItem.remove();
                return;
            }
            
            // 如果点击的不是删除按钮也不是预览文件项，则触发文件选择
            if (!e.target.closest('.file-item')) {
                fileInput.click();
            }
        });
        
        // 拖拽上传
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });
        
        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });
        
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            
            if (e.dataTransfer.files.length) {
                fileInput.files = e.dataTransfer.files;
                // 触发文件选择事件
                fileInput.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
        
        // 文件选择事件
        fileInput.addEventListener('change', () => {
            if (fileInput.files.length) {
                showFilePreviews(fileInput.files, areaId, type);
            }
        });
    }
}

// 显示文件预览
function showFilePreviews(files, areaId, type) {
    const uploadArea = document.getElementById(areaId);
    // 清除之前的预览，但保留提示文字
    const existingPreviews = uploadArea.querySelectorAll('.file-item:not(.preview-item)');
    existingPreviews.forEach(item => item.remove());
    
    Array.from(files).forEach(file => {
        const fileDiv = document.createElement('div');
        fileDiv.className = 'file-item';
        
        // 为图片和视频创建预览
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = function(e) {
                fileDiv.innerHTML = `
                    <div class="file-info-container">
                        <div class="file-name">${file.name}</div>
                        <div class="file-info">大小: ${formatFileSize(file.size)}</div>
                    </div>
                    <div class="preview-container">
                        <img src="${e.target.result}" alt="${file.name}" style="max-width: 100px; max-height: 100px; border-radius: 4px;">
                    </div>
                    <button class="delete-file-btn">删除</button>
                `;
            };
            reader.readAsDataURL(file);
        } else if (file.type.startsWith('video/')) {
            const reader = new FileReader();
            reader.onload = function(e) {
                fileDiv.innerHTML = `
                    <div class="file-info-container">
                        <div class="file-name">${file.name}</div>
                        <div class="file-info">大小: ${formatFileSize(file.size)}</div>
                    </div>
                    <div class="preview-container">
                        <video src="${e.target.result}" style="max-width: 100px; max-height: 100px; border-radius: 4px;" controls></video>
                    </div>
                    <button class="delete-file-btn">删除</button>
                `;
            };
            reader.readAsDataURL(file);
        } else {
            // 非图片/视频文件
            fileDiv.innerHTML = `
                <div class="file-info-container">
                    <div class="file-name">${file.name}</div>
                    <div class="file-info">大小: ${formatFileSize(file.size)}</div>
                </div>
                <button class="delete-file-btn">删除</button>
            `;
        }
        
        uploadArea.appendChild(fileDiv);
    });
}

// 从文件输入中移除特定文件
function removeFileFromInput(fileInput, fileItem) {
    const fileName = fileItem.querySelector('.file-name').textContent;
    const currentFiles = Array.from(fileInput.files);
    const updatedFiles = currentFiles.filter(file => file.name !== fileName);
    
    // 创建一个新的文件列表
    const dt = new DataTransfer();
    updatedFiles.forEach(file => dt.items.add(file));
    fileInput.files = dt.files;
}

function handleFilesSelected(files, type) {
    // 显示选中的文件信息在上传区域
    const areaId = `${type === 'base64' ? 'image-upload-area-base64' : type}-upload-area`;
    showFilePreviews(files, areaId, type);
}

function handlePaste(data) {
    if (Array.isArray(data)) {
        // 粘贴的是文件
        const activePanel = document.querySelector('.function-panel.active');
        if (activePanel) {
            const panelId = activePanel.id;
            let type;
            if (panelId.includes('image')) {
                type = 'image';
            } else if (panelId.includes('video')) {
                type = 'video';
            } else if (panelId.includes('audio')) {
                type = 'audio';
            } else if (panelId.includes('base64')) {
                type = 'base64';
            }
            
            if (type) {
                handleFilesSelected(data, type);
            }
        }
    } else {
        // 粘贴的是文本，可能是视频链接或Base64编码
        if (document.querySelector('#image-base64-panel').classList.contains('active')) {
            // 在Base64面板，将文本放入Base64输入框
            document.getElementById('base64-input').value = data;
        } else if (document.querySelector('#video-download-panel').classList.contains('active')) {
            // 在视频下载面板，将文本放入视频链接输入框
            document.getElementById('video-url').value = data;
        } else {
            // 在其他面板，处理为视频链接
            const videoUrlInput = document.getElementById('video-url');
            if (videoUrlInput) {
                videoUrlInput.value = data;
            }
        }
    }
}

// 从剪贴板粘贴特定类型文件
async function pasteFromClipboard(type) {
    try {
        // 创建一个隐藏的div来接收粘贴事件
        const pasteDiv = document.createElement('div');
        pasteDiv.contentEditable = 'true';
        pasteDiv.style.position = 'fixed';
        pasteDiv.style.left = '-9999px';
        pasteDiv.style.top = '-9999px';
        pasteDiv.style.opacity = '0';
        document.body.appendChild(pasteDiv);
        
        pasteDiv.focus();
        
        // 等待用户粘贴
        const files = await new Promise((resolve) => {
            pasteDiv.addEventListener('paste', (e) => {
                e.preventDefault();
                const items = Array.from(e.clipboardData.items);
                const files = [];
                
                for (const item of items) {
                    if (item.kind === 'file') {
                        files.push(item.getAsFile());
                    }
                }
                
                document.body.removeChild(pasteDiv);
                resolve(files);
            });
            
            // 触发粘贴
            document.execCommand('paste');
        });
        
        if (files.length > 0) {
            handleFilesSelected(files, type);
        } else {
            alert('剪贴板中没有找到文件');
        }
    } catch (err) {
        console.error('粘贴失败:', err);
        alert('粘贴失败，请确保已复制文件到剪贴板');
    }
}

// 清除上传区域
function clearUploadArea(type) {
    if (type === 'base64') {
        // 对于Base64，清除图片上传和文本输入
        const fileInput = document.getElementById('base64-upload');
        const textArea = document.getElementById('base64-input');
        if (fileInput) fileInput.value = '';
        if (textArea) textArea.value = '';
        
        // 清除上传区域的预览
        const uploadArea = document.getElementById('image-upload-area-base64');
        if (uploadArea) {
            const fileItems = uploadArea.querySelectorAll('.file-item');
            fileItems.forEach(item => item.remove());
        }
    } else {
        // 其他类型的清除操作
        const fileInputId = `${type}-upload`;
        const fileInput = document.getElementById(fileInputId);
        if (fileInput) {
            fileInput.value = '';
        }
        
        const areaId = `${type}-upload-area`;
        const uploadArea = document.getElementById(areaId);
        if (uploadArea) {
            const fileItems = uploadArea.querySelectorAll('.file-item');
            fileItems.forEach(item => item.remove());
        }
    }
}

function bindClipboardEvents() {
    // 这里可以绑定剪贴板相关事件
}

// 清除视频链接
function clearVideoUrl() {
    document.getElementById('video-url').value = '';
}

// 切换批量模式
function switchBatchMode() {
    isBatchMode = !isBatchMode;
    
    const singleInputArea = document.querySelector('.input-group');
    const batchInputArea = document.getElementById('batch-input-area');
    const switchBatchBtn = document.getElementById('switch-batch-btn');
    const downloadVideoBtn = document.getElementById('download-video-btn');
    
    if (isBatchMode) {
        // 切换到批量模式
        singleInputArea.style.display = 'none';
        batchInputArea.style.display = 'block';
        switchBatchBtn.textContent = '切换: 单个解析';
        downloadVideoBtn.textContent = '批量解析';
        downloadVideoBtn.onclick = parseBatchVideos;
    } else {
        // 切换到单个模式
        singleInputArea.style.display = 'block';
        batchInputArea.style.display = 'none';
        switchBatchBtn.textContent = '切换: 批量解析';
        downloadVideoBtn.textContent = '解析视频';
        downloadVideoBtn.onclick = downloadVideo;
    }
}

// 切换转换模式
function switchConversionMode() {
    isBase64ToImageMode = !isBase64ToImageMode;
    
    const imageUploadArea = document.getElementById('image-upload-area-base64');
    const base64InputArea = document.getElementById('base64-input-area');
    const switchModeBtn = document.getElementById('switch-mode-btn');
    const processBtn = document.getElementById('process-btn');
    
    if (isBase64ToImageMode) {
        // 切换到Base64转图片模式
        imageUploadArea.style.display = 'none';
        base64InputArea.style.display = 'flex';
        switchModeBtn.textContent = '切换: 图片转Base64';
        processBtn.textContent = 'Base64转图片';
    } else {
        // 切换到图片转Base64模式
        imageUploadArea.style.display = 'flex';
        base64InputArea.style.display = 'none';
        switchModeBtn.textContent = '切换: Base64转图片';
        processBtn.textContent = '图片转Base64';
    }
}

// 主要处理函数：根据当前模式执行转换
function handleImageBase64Conversion() {
    if (isBase64ToImageMode) {
        base64ToImage();
    } else {
        generateBase64();
    }
}

// 解析单个视频
async function downloadVideo() {
    const videoUrl = document.getElementById('video-url').value.trim();
    if (!videoUrl) {
        alert('请输入视频链接');
        return;
    }
    
    const resultDiv = document.getElementById('video-download-result');
    resultDiv.innerHTML = `<p>正在解析视频链接: ${videoUrl}</p><p>解析中，请稍后……</p>`;
    
    try {
        // 使用VideoExtractor模块获取视频信息和下载链接
        const videoInfo = await VideoExtractor.extractVideoInfoWithDownloadUrl(videoUrl);
        
        // 构建更简洁的结果视图：显示大缩略图模块并聚合去重格式
        (function(){
            const formats = Array.isArray(videoInfo.formats) ? videoInfo.formats : [];

            // grouping: use coarse grouping (ext + height + vcodec) to avoid near-duplicate entries
            const groups = {};
            for (const f of formats) {
                const ext = (f.ext || 'mp4').toLowerCase();
                const height = f.height ? String(f.height) : (f.format_note || 'auto');
                const vcodec = f.vcodec || 'unknown';
                const key = `${ext}::${height}::${vcodec}`;

                // prefer entry with filesize or larger filesize
                if (!groups[key]) groups[key] = f;
                else {
                    const a = groups[key];
                    if ((f.filesize || 0) > (a.filesize || 0)) groups[key] = f;
                }
            }

            const items = Object.values(groups);

            let html = '';
            html += '<div class="video-info-preview">';
            html += '<div style="display:flex;align-items:flex-start;gap:16px;">';
            html += `<div style="flex:0 0 280px;cursor:pointer;position:relative;">`;
            html += `<img id="video-thumb" src="${videoInfo.thumbnail}" alt="缩略图" style="width:280px;border-radius:6px;display:block;">`;
            // play overlay
            html += `<div id="thumb-play" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.5);width:64px;height:64px;border-radius:50%;display:flex;align-items:center;justify-content:center;">`;
            html += `<span style="color:#fff;font-size:22px;">▶</span></div>`;
            html += `</div>`;
            html += '<div style="flex:1;">';
            html += `<h3 style="margin:0 0 8px 0">${videoInfo.title}</h3>`;
            html += `<p style="margin:4px 0"><strong>作者:</strong> ${videoInfo.author}</p>`;
            html += `<p style="margin:4px 0"><strong>时长:</strong> ${videoInfo.duration}</p>`;
            html += `<p style="margin:4px 0"><strong>播放量:</strong> ${videoInfo.viewCount}</p>`;
            html += `<p style="margin:4px 0"><strong>发布日期:</strong> ${videoInfo.publishDate}</p>`;
            html += `</div></div>`;

            // format list
            html += '<div style="margin-top:16px"><h5>可用格式:</h5>';
            html += '<div class="format-list">';

            const seen = new Set();
            for (const format of items) {
                const fid = format.format_id || '';
                const key = fid || ((format.ext||'') + '::' + (format.height||'') + '::' + (format.vcodec||''));
                if (seen.has(key)) continue;
                seen.add(key);

                const outExt = (format.ext || 'mp4').toLowerCase();
                const sizeText = format.filesize ? formatFileSize(format.filesize) : '未知大小';
                const label = format.format_note || format.quality || (format.height ? format.height + 'p' : fid || outExt);
                const rawUrl = format.url || '';
                const needsProxy = !rawUrl || rawUrl.includes('.m4s') || rawUrl.split('\n').length > 1 || rawUrl.includes('/api/video/serve') || rawUrl.startsWith(API_BASE + '/api/video/serve');

                const filename = `${(videoInfo.title||'video').replace(/[<>:\\"/\\|?*]/g,'_')}_${label}.${outExt}`;
                const encodedUrl = encodeURIComponent(rawUrl);

                    html += `<div class="format-item" style="margin:8px 0;padding:10px;border:1px solid #eee;border-radius:4px;display:flex;justify-content:space-between;align-items:center;">`;
                    html += `<div><strong>${label}</strong> | ${outExt.toUpperCase()} | ${sizeText}${needsProxy? ' (需代理)' : ''}</div>`;
                    html += `<div style="display:flex;gap:8px">`;
                    html += `<button type="button" class="btn watch-btn" data-url="${encodedUrl}" data-fid="${fid}" data-orig="${encodeURIComponent(videoUrl)}" data-title="${encodeURIComponent(videoInfo.title||'video')}">观看</button>`;
                    html += `<button type="button" class="btn primary download-btn" data-url="${encodedUrl}" data-fid="${fid}" data-filename="${encodeURIComponent(filename)}" data-orig="${encodeURIComponent(videoUrl)}">下载</button>`;
                    html += `</div></div>`;
            }
            html += '</div></div>';

            resultDiv.innerHTML = html;

            // bind thumb click -> play best format
            const thumb = document.getElementById('video-thumb');
            if (thumb) {
                thumb.style.cursor = 'pointer';
                thumb.addEventListener('click', () => {
                    // pick best available (largest filesize or first)
                    let pick = items.slice().sort((a,b)=> (b.filesize||0)-(a.filesize||0))[0] || items[0];
                    const src = pick && pick.url ? pick.url : '';
                    const fid = pick ? (pick.format_id||'best') : 'best';
                    watchVideo(src, fid, videoUrl, videoInfo.title || 'video');
                });
            }
            // also remove small play overlay click
            const overlayPlay = document.getElementById('thumb-play');
            if (overlayPlay) overlayPlay.addEventListener('click', (e)=>{ e.stopPropagation(); thumb && thumb.click(); });
                // bind dynamic buttons (watch/download) to avoid inline onclick navigation
                setTimeout(() => {
                    try {
                        const watchBtns = resultDiv.querySelectorAll('.watch-btn');
                        watchBtns.forEach(b => {
                            b.addEventListener('click', (ev) => {
                                ev.preventDefault();
                                ev.stopPropagation();
                                const url = decodeURIComponent(b.getAttribute('data-url') || '');
                                const fid = b.getAttribute('data-fid') || 'best';
                                const orig = decodeURIComponent(b.getAttribute('data-orig') || '');
                                const title = decodeURIComponent(b.getAttribute('data-title') || 'video');
                                watchVideo(url, fid, orig, title);
                            });
                        });

                        const dlBtns = resultDiv.querySelectorAll('.download-btn');
                        dlBtns.forEach(b => {
                            b.addEventListener('click', async (ev) => {
                                ev.preventDefault();
                                ev.stopPropagation();
                                const url = decodeURIComponent(b.getAttribute('data-url') || '');
                                const fid = b.getAttribute('data-fid') || 'best';
                                const filename = decodeURIComponent(b.getAttribute('data-filename') || 'video.mp4');
                                const orig = decodeURIComponent(b.getAttribute('data-orig') || '');
                                await downloadVideoFile(url, filename, fid, orig);
                            });
                        });
                    } catch (e) {
                        console.warn('bind dynamic buttons failed', e);
                    }
                }, 50);
        })();
    } catch (error) {
        resultDiv.innerHTML = `<p style="color: red;">❌ 解析失败: ${error.message}</p>`;
    }
}

// 下载视频文件
async function downloadVideoFile(downloadUrl, filename, formatId, originalUrl) {
    // 参数可能是 URI 编码的，请确保解码
    try {
        downloadUrl = downloadUrl || '';
        filename = filename || 'video.mp4';
        formatId = formatId || 'best';
        originalUrl = originalUrl || '';

        // If no direct URL or if URL looks like segmented (.m4s) or multi-line, use backend proxy
        const looksSegmented = (u) => !u || u.includes('.m4s') || u.split('\n').length > 1;

        let openUrl = '';
        if (!downloadUrl || looksSegmented(downloadUrl)) {
            if (!originalUrl) {
                // nothing we can do
                alert('无法获取下载链接，请先解析视频');
                return;
            }
            openUrl = `${API_BASE}/api/video/serve?u=${encodeURIComponent(originalUrl)}&f=${encodeURIComponent(formatId)}&t=${encodeURIComponent(filename)}`;
        } else {
            openUrl = downloadUrl;
        }

        // Open download in a new tab to avoid replacing current page
        try {
            const a = document.createElement('a');
            a.href = openUrl;
            a.target = '_blank';
            a.rel = 'noopener';
            // let browser decide content-disposition; do not rely on download attribute for cross-origin
            document.body.appendChild(a);
            a.click();
            setTimeout(() => a.remove(), 1000);
            return;
        } catch (err) {
            console.error('发起下载失败:', err);
            alert('发起下载失败: ' + (err.message || err));
        }

    } catch (error) {
        console.error('下载失败:', error);
        alert('下载失败: ' + (error.message || error));
    }
}

// 在页面内弹出播放器并播放（优先使用代理或同源 URL）
function watchVideo(downloadUrl, formatId, originalUrl, title) {
    try {
        downloadUrl = downloadUrl || '';
        formatId = formatId || 'best';
        originalUrl = originalUrl || '';
        title = title || 'video';

        // 选择播放源：同域或代理优先
        let src = '';
        const isProxyPath = downloadUrl && (downloadUrl.startsWith('/') || downloadUrl.startsWith(window.location.origin + '/'));
        const isExternal = (url) => {
            try { return new URL(url, window.location.href).origin !== window.location.origin; } catch (e) { return false; }
        };

        if (downloadUrl && (!isExternal(downloadUrl) || isProxyPath || downloadUrl.startsWith(API_BASE + '/')) ) {
            src = downloadUrl;
        } else if (originalUrl) {
            src = `${API_BASE}/api/video/serve?u=${encodeURIComponent(originalUrl)}&f=${encodeURIComponent(formatId)}&t=${encodeURIComponent(title)}`;
        } else if (downloadUrl) {
            src = downloadUrl; // 最后救济
        } else {
            alert('无法找到可播放的源');
            return;
        }

        // 创建覆盖层
        let overlay = document.getElementById('player-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'player-overlay';
            overlay.style.position = 'fixed';
            overlay.style.left = '0';
            overlay.style.top = '0';
            overlay.style.width = '100%';
            overlay.style.height = '100%';
            overlay.style.background = 'rgba(0,0,0,0.75)';
            overlay.style.display = 'flex';
            overlay.style.alignItems = 'center';
            overlay.style.justifyContent = 'center';
            overlay.style.zIndex = '9999';
            overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
            document.body.appendChild(overlay);
        } else {
            overlay.innerHTML = '';
            overlay.style.display = 'flex';
        }

        const container = document.createElement('div');
        container.style.width = '80%';
        container.style.maxWidth = '1100px';
        container.style.background = '#111';
        container.style.padding = '12px';
        container.style.borderRadius = '8px';
        container.style.boxShadow = '0 6px 30px rgba(0,0,0,0.6)';

        const titleEl = document.createElement('div');
        titleEl.style.color = '#fff';
        titleEl.style.marginBottom = '8px';
        try {
            titleEl.textContent = decodeURIComponent(title || '');
        } catch (e) {
            titleEl.textContent = title || '';
        }

        const video = document.createElement('video');
        video.controls = true;
        video.autoplay = true;
        video.style.width = '100%';

        const source = document.createElement('source');
        source.src = src;
        source.type = 'video/mp4';
        video.appendChild(source);

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '关闭';
        closeBtn.style.marginTop = '8px';
        closeBtn.addEventListener('click', () => overlay.remove());

        container.appendChild(titleEl);
        container.appendChild(video);
        container.appendChild(closeBtn);
        overlay.appendChild(container);
    } catch (err) {
        console.error('打开播放器失败:', err);
        alert('无法播放视频: ' + err.message);
    }
}

// 批量解析视频
async function parseBatchVideos() {
    const batchUrlsTextarea = document.getElementById('batch-urls');
    const urlsText = batchUrlsTextarea.value.trim();
    
    if (!urlsText) {
        alert('请输入视频链接');
        return;
    }
    
    const urls = urlsText.split('\n').map(url => url.trim()).filter(url => url);
    if (urls.length === 0) {
        alert('没有找到有效的视频链接');
        return;
    }
    
    const resultDiv = document.getElementById('video-download-result');
    resultDiv.innerHTML = `<p>正在批量解析 ${urls.length} 个视频链接……</p>`;
    
    try {
        // 使用VideoExtractor模块批量解析
        const results = await VideoExtractor.extractBatchVideoInfo(urls);
        
        // 构建结果HTML
        let html = '<h4>批量解析结果</h4><div class="batch-results">';
        results.forEach((result, index) => {
            if (result.success) {
                html += `
                    <div class="batch-result-item" style="margin: 15px 0; padding: 15px; border: 1px solid #e0e0e0; border-radius: 8px;">
                        <h5>视频 ${index + 1}: ${result.info.title}</h5>
                        <p><strong>链接:</strong> ${result.url}</p>
                        <div style="display: flex; align-items: flex-start; margin-top: 10px;">
                            <img src="${result.info.thumbnail}" alt="视频缩略图" style="max-width: 150px; border-radius: 4px; margin-right: 15px;">
                            <div style="flex: 1;">
                                <p><strong>作者:</strong> ${result.info.author}</p>
                                <p><strong>时长:</strong> ${result.info.duration}</p>
                                <p><strong>播放量:</strong> ${result.info.viewCount}</p>
                                <div style="margin-top: 10px;">
                                    <h6>可用格式:</h6>
                                    <div class="format-list">
                                        ${(() => {
                                            const seen = new Set();
                                            const items = [];
                                            for (const f of result.info.formats) {
                                                const key = (f.format_id || f.format_note || f.quality || f.height || f.url || '') + '::' + (f.ext || f.format || '');
                                                if (seen.has(key)) continue;
                                                seen.add(key);
                                                items.push(f);
                                            }

                                            return items.map(format => {
                                                const fid = format.format_id || '';
                                                const safeTitle = (result.info.title || 'video').replace(/[<>:\\"/\\|?*]/g, '_');
                                                const outExt = (format.ext || 'mp4').toLowerCase();
                                                const filename = `${safeTitle}_${format.format_note || format.quality || fid}.${outExt}`;
                                                const urlParam = encodeURIComponent(format.url || '');
                                                const orig = encodeURIComponent(result.url);
                                                return `\n                                                <div class="format-item" style="margin: 5px 0; padding: 8px; border: 1px solid #f0f0f0; border-radius: 4px;">\n                                                    <div style="display: flex; justify-content: space-between; align-items: center;">\n                                                        <div>\n                                                            <strong>${format.format_note || format.quality || fid}</strong> | ${outExt.toUpperCase()} | ${format.size || '未知大小'}\n                                                        </div>\n                                                        <div style=\"display:flex;gap:8px;\">\n                                                            <button class=\"watch-link btn\" onclick=\"watchVideo(decodeURIComponent('${urlParam}'), decodeURIComponent('${encodeURIComponent(fid)}'), decodeURIComponent('${orig}'), decodeURIComponent('${encodeURIComponent(safeTitle)}'))\">观看</button>\n                                                            <button class=\"download-link btn primary\" onclick=\"downloadVideoFile(decodeURIComponent('${urlParam}'), decodeURIComponent('${encodeURIComponent(filename)}'), decodeURIComponent('${encodeURIComponent(fid)}'), decodeURIComponent('${orig}'))\">下载</button>\n                                                        </div>\n                                                    </div>\n                                                </div>`;
                                            }).join('');
                                        })()}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            } else {
                html += `
                    <div class="batch-result-item error" style="margin: 15px 0; padding: 15px; border: 1px solid #ffdddd; border-radius: 8px; background-color: #ffe6e6;">
                        <h5 style="color: #d00;">解析失败 - 视频 ${index + 1}</h5>
                        <p><strong>链接:</strong> ${result.url}</p>
                        <p style="color: #a00;">错误: ${result.error}</p>
                    </div>
                `;
            }
        });
        html += '</div>';
        
        resultDiv.innerHTML = html;
        // bind batch dynamic buttons
        setTimeout(() => {
            try {
                const watchLinks = resultDiv.querySelectorAll('.watch-link');
                watchLinks.forEach(b => {
                    b.addEventListener('click', (ev) => {
                        ev.preventDefault(); ev.stopPropagation();
                        const url = decodeURIComponent(b.getAttribute('data-url') || '');
                        const fid = b.getAttribute('data-fid') || 'best';
                        const orig = decodeURIComponent(b.getAttribute('data-orig') || '');
                        const title = decodeURIComponent(b.getAttribute('data-title') || 'video');
                        watchVideo(url, fid, orig, title);
                    });
                });
                const dlLinks = resultDiv.querySelectorAll('.download-link');
                dlLinks.forEach(b => {
                    b.addEventListener('click', async (ev) => {
                        ev.preventDefault(); ev.stopPropagation();
                        const url = decodeURIComponent(b.getAttribute('data-url') || '');
                        const fid = b.getAttribute('data-fid') || 'best';
                        const filename = decodeURIComponent(b.getAttribute('data-filename') || 'video.mp4');
                        const orig = decodeURIComponent(b.getAttribute('data-orig') || '');
                        await downloadVideoFile(url, filename, fid, orig);
                    });
                });
            } catch (err) { console.warn('bind batch buttons failed', err); }
        }, 50);
    } catch (error) {
        resultDiv.innerHTML = `<p style="color: red;">❌ 批量解析失败: ${error.message}</p>`;
    }
}

// 粘贴URL功能
async function pasteUrlFromClipboard() {
    try {
        const text = await FileUploader.readTextFromClipboard();
        document.getElementById('video-url').value = text;
        alert('链接已粘贴');
    } catch (err) {
        console.error('无法访问剪贴板:', err);
        alert('无法访问剪贴板，请手动粘贴链接');
    }
}

// 图片转换功能
async function convertImages() {
    const fileInput = document.getElementById('image-upload');
    if (!fileInput.files.length) {
        alert('请先选择图片文件');
        return;
    }
    
    const format = document.getElementById('image-format').value;
    const resultDiv = document.getElementById('image-convert-result');
    resultDiv.innerHTML = `<p>正在转换图片为 ${format.toUpperCase()} 格式...</p>`;
    
    try {
        // 创建预览容器
        const previewContainer = document.createElement('div');
        previewContainer.className = 'preview-container';
        resultDiv.appendChild(previewContainer);
        
        for (let i = 0; i < fileInput.files.length; i++) {
            const file = fileInput.files[i];
            const convertedBlob = await FormatConverter.convertImage(file, format);
            const downloadUrl = URL.createObjectURL(convertedBlob);
            
            // 创建预览项
            const previewItem = document.createElement('div');
            previewItem.className = 'preview-item';
            previewItem.innerHTML = `
                <img src="${downloadUrl}" alt="Converted ${file.name}" />
                <div class="file-name">${file.name}</div>
                <a href="${downloadUrl}" class="download-link" download="${file.name.substring(0, file.name.lastIndexOf('.'))}.${format}">下载转换后图片</a>
            `;
            
            previewContainer.appendChild(previewItem);
        }
        
        resultDiv.innerHTML += '<p>✅ 所有图片转换完成！</p>';
    } catch (error) {
        resultDiv.innerHTML = `<p style="color: red;">❌ 转换失败: ${error.message}</p>`;
    }
}

// 视频转换功能
async function convertVideos() {
    const fileInput = document.getElementById('video-upload');
    if (!fileInput.files.length) {
        alert('请先选择视频文件');
        return;
    }
    
    const format = document.getElementById('video-format').value;
    const resultDiv = document.getElementById('video-convert-result');
    resultDiv.innerHTML = `<p>正在转换视频为 ${format.toUpperCase()} 格式...</p>`;
    
    try {
        // 创建预览容器
        const previewContainer = document.createElement('div');
        previewContainer.className = 'preview-container';
        resultDiv.appendChild(previewContainer);
        
        for (let i = 0; i < fileInput.files.length; i++) {
            const file = fileInput.files[i];
            const convertedBlob = await FormatConverter.convertVideo(file, format);
            const downloadUrl = URL.createObjectURL(convertedBlob);
            
            // 创建预览项
            const previewItem = document.createElement('div');
            previewItem.className = 'preview-item';
            previewItem.innerHTML = `
                <video src="${downloadUrl}" controls style="max-width: 100%;"></video>
                <div class="file-name">${file.name}</div>
                <a href="${downloadUrl}" class="download-link" download="${file.name.substring(0, file.name.lastIndexOf('.'))}.${format}">下载转换后视频</a>
            `;
            
            previewContainer.appendChild(previewItem);
        }
        
        resultDiv.innerHTML += '<p>✅ 所有视频转换完成！</p>';
    } catch (error) {
        resultDiv.innerHTML = `<p style="color: red;">❌ 转换失败: ${error.message}</p>`;
    }
}

// 音频转换功能
async function convertAudios() {
    const fileInput = document.getElementById('audio-upload');
    if (!fileInput.files.length) {
        alert('请先选择音频文件');
        return;
    }
    
    const format = document.getElementById('audio-format').value;
    const resultDiv = document.getElementById('audio-convert-result');
    resultDiv.innerHTML = `<p>正在转换音频为 ${format.toUpperCase()} 格式...</p>`;
    
    try {
        // 创建预览容器
        const previewContainer = document.createElement('div');
        previewContainer.className = 'preview-container';
        resultDiv.appendChild(previewContainer);
        
        for (let i = 0; i < fileInput.files.length; i++) {
            const file = fileInput.files[i];
            const convertedBlob = await FormatConverter.convertAudio(file, format);
            const downloadUrl = URL.createObjectURL(convertedBlob);
            
            // 创建预览项
            const previewItem = document.createElement('div');
            previewItem.className = 'preview-item';
            previewItem.innerHTML = `
                <audio controls style="width: 100%;">
                    <source src="${downloadUrl}" type="audio/${format}">
                    您的浏览器不支持音频元素。
                </audio>
                <div class="file-name">${file.name}</div>
                <a href="${downloadUrl}" class="download-link" download="${file.name.substring(0, file.name.lastIndexOf('.'))}.${format}">下载转换后音频</a>
            `;
            
            previewContainer.appendChild(previewItem);
        }
        
        resultDiv.innerHTML += '<p>✅ 所有音频转换完成！</p>';
    } catch (error) {
        resultDiv.innerHTML = `<p style="color: red;">❌ 转换失败: ${error.message}</p>`;
    }
}

// 生成Base64功能（图片转Base64）
async function generateBase64() {
    const fileInput = document.getElementById('base64-upload');
    if (!fileInput.files.length) {
        alert('请先选择一张图片');
        return;
    }
    
    const file = fileInput.files[0];
    
    try {
        const base64String = await FormatConverter.imageToBase64(file);
        document.getElementById('base64-result').value = base64String;
        
        // 显示预览
        const resultDiv = document.getElementById('image-base64-result');
        resultDiv.innerHTML = `
            <div class="preview-container">
                <div class="preview-item">
                    <img src="${base64String}" alt="预览图" style="max-width: 100%; border-radius: 4px;">
                    <div class="file-name">${file.name}</div>
                    <p><strong>大小:</strong> ${formatFileSize(file.size)}</p>
                    <p><strong>MIME类型:</strong> ${file.type}</p>
                    <p><strong>Base64长度:</strong> ${base64String.length} 字符</p>
                </div>
            </div>
        `;
    } catch (error) {
        document.getElementById('base64-result').value = `错误: ${error.message}`;
        alert(`生成Base64失败: ${error.message}`);
    }
}

// Base64转图片功能
async function base64ToImage() {
    const base64Input = document.getElementById('base64-input').value.trim();
    if (!base64Input) {
        alert('请先在文本框中输入或粘贴Base64字符串');
        return;
    }
    
    try {
        // 验证Base64格式
        if (!base64Input.startsWith('data:image')) {
            alert('输入的Base64字符串格式不正确，请确保以"data:image"开头');
            return;
        }
        
        // 创建图片元素进行预览
        const resultDiv = document.getElementById('image-base64-result');
        resultDiv.innerHTML = `
            <div class="preview-container">
                <div class="preview-item">
                    <img src="${base64Input}" alt="Base64转换图片预览" style="max-width: 100%; border-radius: 4px;">
                    <p><strong>Base64转图片预览</strong></p>
                    <a href="${base64Input}" class="download-link" download="converted-image.png">下载图片</a>
                </div>
            </div>
        `;
    } catch (error) {
        alert(`Base64转图片失败: ${error.message}`);
    }
}

// 复制Base64到剪贴板
async function copyBase64ToClipboard() {
    const base64Result = document.getElementById('base64-result');
    if (!base64Result.value) {
        alert('没有Base64内容可复制');
        return;
    }
    
    try {
        await FileUploader.writeTextToClipboard(base64Result.value);
        alert('Base64内容已复制到剪贴板');
    } catch (err) {
        console.error('复制失败:', err);
        alert('复制失败: ' + err.message);
    }
}

// 工具函数：格式化文件大小
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}