/**
 * 文件上传处理模块
 * 负责处理文件上传、拖拽和粘贴功能
 */
class FileUploader {
    /**
     * 初始化上传区域
     * @param {string} areaId - 上传区域的ID
     * @param {Function} onFilesSelected - 文件选择后的回调函数
     */
    static initUploadArea(areaId, onFilesSelected) {
        const uploadArea = document.getElementById(areaId);
        if (!uploadArea) {
            console.error(`找不到ID为 ${areaId} 的上传区域`);
            return;
        }
        
        // 创建隐藏的文件输入框
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.id = `${areaId.replace('-area', '')}-input`;
        fileInput.style.display = 'none';
        fileInput.multiple = true;
        
        // 根据区域类型设置接受的文件类型
        if (areaId.includes('image')) {
            fileInput.accept = 'image/*';
        } else if (areaId.includes('video')) {
            fileInput.accept = 'video/*';
        } else if (areaId.includes('audio')) {
            fileInput.accept = 'audio/*';
        } else {
            fileInput.accept = '*/*';
        }
        
        uploadArea.parentNode.insertBefore(fileInput, uploadArea.nextSibling);
        
        // 点击上传区域触发文件选择
        uploadArea.addEventListener('click', () => {
            fileInput.click();
        });
        
        // 文件选择事件
        fileInput.addEventListener('change', () => {
            if (fileInput.files.length > 0) {
                onFilesSelected(Array.from(fileInput.files));
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
            
            if (e.dataTransfer.files.length > 0) {
                onFilesSelected(Array.from(e.dataTransfer.files));
            }
        });
    }
    
    /**
     * 初始化粘贴功能
     * @param {Function} onPaste - 粘贴事件的回调函数
     */
    static initPasteFunctionality(onPaste) {
        document.addEventListener('paste', async (e) => {
            // 检查是否在文本输入框中粘贴
            const target = e.target;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
                return;
            }
            
            // 检查是否有文件粘贴
            if (e.clipboardData && e.clipboardData.items) {
                const items = Array.from(e.clipboardData.items);
                const files = [];
                
                for (const item of items) {
                    if (item.kind === 'file') {
                        files.push(item.getAsFile());
                    }
                }
                
                if (files.length > 0) {
                    e.preventDefault();
                    onPaste(files);
                    return;
                }
            }
            
            // 如果没有文件，则尝试获取文本
            const text = e.clipboardData.getData('text/plain');
            if (text) {
                onPaste(text);
            }
        });
    }
    
    /**
     * 从剪贴板读取文本
     * @returns {Promise<string>} 剪贴板中的文本
     */
    static async readTextFromClipboard() {
        try {
            if (navigator.clipboard && navigator.clipboard.readText) {
                return await navigator.clipboard.readText();
            } else {
                // 降级方案
                return new Promise((resolve) => {
                    const textArea = document.createElement('textarea');
                    textArea.contentEditable = 'true';
                    textArea.style.position = 'fixed';
                    textArea.style.left = '-9999px';
                    textArea.style.width = '1px';
                    textArea.style.height = '1px';
                    textArea.style.padding = '0';
                    textArea.style.border = 'none';
                    textArea.style.outline = 'none';
                    textArea.style.boxShadow = 'none';
                    textArea.style.background = 'transparent';
                    
                    document.body.appendChild(textArea);
                    textArea.focus();
                    document.execCommand('selectAll');
                    
                    const successful = document.execCommand('paste');
                    const text = successful ? textArea.value : '';
                    
                    document.body.removeChild(textArea);
                    resolve(text);
                });
            }
        } catch (err) {
            console.error('无法从剪贴板读取文本:', err);
            throw new Error('无法从剪贴板读取文本');
        }
    }
    
    /**
     * 将文本写入剪贴板
     * @param {string} text - 要写入的文本
     * @returns {Promise<void>}
     */
    static async writeTextToClipboard(text) {
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
            } else {
                // 降级方案
                return new Promise((resolve, reject) => {
                    const textArea = document.createElement('textarea');
                    textArea.value = text;
                    textArea.style.position = 'fixed';
                    textArea.style.left = '-9999px';
                    textArea.style.width = '1px';
                    textArea.style.height = '1px';
                    textArea.style.padding = '0';
                    textArea.style.border = 'none';
                    textArea.style.outline = 'none';
                    textArea.style.boxShadow = 'none';
                    textArea.style.background = 'transparent';
                    
                    document.body.appendChild(textArea);
                    textArea.focus();
                    textArea.select();
                    
                    const successful = document.execCommand('copy');
                    document.body.removeChild(textArea);
                    
                    if (successful) {
                        resolve();
                    } else {
                        reject(new Error('复制失败'));
                    }
                });
            }
        } catch (err) {
            console.error('无法写入剪贴板:', err);
            throw new Error('无法写入剪贴板');
        }
    }
    
    /**
     * 上传文件到服务器
     * @param {File} file - 要上传的文件
     * @param {string} uploadUrl - 上传地址
     * @param {Function} onProgress - 进度回调函数
     * @returns {Promise<Object>} 上传结果
     */
    static async uploadFile(file, uploadUrl, onProgress) {
        return new Promise((resolve, reject) => {
            const formData = new FormData();
            formData.append('file', file);
            
            const xhr = new XMLHttpRequest();
            
            // 监听上传进度
            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable && onProgress) {
                    const percentComplete = (e.loaded / e.total) * 100;
                    onProgress(percentComplete, e.loaded, e.total);
                }
            });
            
            xhr.addEventListener('load', () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        const response = JSON.parse(xhr.responseText);
                        resolve(response);
                    } catch (e) {
                        resolve({ success: true, data: xhr.responseText });
                    }
                } else {
                    reject(new Error(`上传失败，状态码: ${xhr.status}`));
                }
            });
            
            xhr.addEventListener('error', () => {
                reject(new Error('上传请求失败'));
            });
            
            xhr.open('POST', uploadUrl);
            xhr.send(formData);
        });
    }
    
    /**
     * 批量上传文件
     * @param {File[]} files - 要上传的文件数组
     * @param {string} uploadUrl - 上传地址
     * @param {Function} onProgress - 进度回调函数
     * @returns {Promise<Object[]>} 上传结果数组
     */
    static async uploadFiles(files, uploadUrl, onProgress) {
        const results = [];
        
        for (let i = 0; i < files.length; i++) {
            try {
                const result = await this.uploadFile(
                    files[i], 
                    uploadUrl, 
                    (percent, loaded, total) => {
                        // 计算整体进度
                        const overallProgress = ((i + percent / 100) / files.length) * 100;
                        onProgress && onProgress(overallProgress, i + 1, files.length);
                    }
                );
                results.push(result);
            } catch (error) {
                results.push({ error: error.message });
            }
        }
        
        return results;
    }
}

// 导出模块（如果在Node.js环境中）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FileUploader;
}