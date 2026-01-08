/**
 * 视频提取模块
 * 负责从视频网站链接中提取视频信息和下载链接
 */
class VideoExtractor {
    // 本地服务器地址
    static BASE_URL = 'http://localhost:8080';
    
    /**
     * 从视频链接中提取视频信息和下载链接
     * @param {string} url - 视频链接
     * @param {string} quality - 视频质量
     * @returns {Promise<Object>} 包含视频信息和下载链接的Promise对象
     */
    static async extractVideoInfoWithDownloadUrl(url, quality = 'best') {
        // 检测URL类型
        const videoSource = this.detectVideoSource(url);
        
        if (!videoSource) {
            throw new Error('不支持的视频源或链接格式不正确');
        }
        
        // 检查是否为有效的URL
        try {
            new URL(url);
        } catch (e) {
            throw new Error('无效的视频链接');
        }
        
        try {
            // 使用新的API端点，一次性获取视频信息和下载链接
            const response = await fetch(`${this.BASE_URL}/api/video/info-with-download`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ url: url, quality: quality })
            });
            
            if (!response.ok) {
                throw new Error(`获取视频信息和下载链接失败: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error);
            }
            
            // 转换API响应为内部格式
            return this.transformApiResponse(data);
        } catch (error) {
            console.error('获取视频信息和下载链接失败:', error);
            throw new Error(`无法获取视频信息和下载链接: ${error.message}. 请确保后端服务已启动.`);
        }
    }
    
    /**
     * 从视频链接中提取视频信息（仅信息，不包含下载链接）
     * @param {string} url - 视频链接
     * @returns {Promise<Object>} 包含视频信息的Promise对象
     */
    static async extractVideoInfo(url) {
        // 检测URL类型
        const videoSource = this.detectVideoSource(url);
        
        if (!videoSource) {
            throw new Error('不支持的视频源或链接格式不正确');
        }
        
        // 检查是否为有效的URL
        try {
            new URL(url);
        } catch (e) {
            throw new Error('无效的视频链接');
        }
        
        // 发送请求到本地服务器
        try {
            const response = await fetch(`${this.BASE_URL}/api/video/info`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    url: url
                })
            });
            
            if (!response.ok) {
                throw new Error(`服务器错误: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error);
            }
            
            // 转换API响应为内部格式
            return this.transformApiResponse(data);
        } catch (error) {
            console.error('获取视频信息失败:', error);
            
            // 如果本地服务器不可用，提供一个错误提示
            throw new Error(`无法获取视频信息: ${error.message}. 请确保后端服务已启动.`);
        }
    }
    
    /**
     * 获取视频下载链接
     * @param {string} url - 视频链接
     * @param {string} quality - 视频质量
     * @returns {Promise<string>} 包含下载链接的Promise对象
     */
    static async getVideoDownloadUrl(url, quality = 'best') {
        try {
            const response = await fetch(`${this.BASE_URL}/api/video/download`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    url: url,
                    quality: quality
                })
            });
            
            if (!response.ok) {
                throw new Error(`服务器错误: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error);
            }
            
            return data.downloadUrl;
        } catch (error) {
            console.error('获取下载链接失败:', error);
            throw new Error(`无法获取下载链接: ${error.message}. 请确保后端服务已启动.`);
        }
    }
    
    /**
     * 转换API响应为内部格式
     * @param {Object} apiResponse - API响应数据
     * @returns {Object} 转换后的数据
     */
    static transformApiResponse(apiResponse) {
        return {
            title: apiResponse.title || '未知标题',
            duration: apiResponse.duration || '未知时长',
            author: apiResponse.author || '未知作者',
            viewCount: apiResponse.viewCount || '未知',
            publishDate: apiResponse.publishDate || '未知日期',
            formats: apiResponse.formats || [
                { quality: '原画', format: 'mp4', size: '未知', url: '' }
            ],
            thumbnail: apiResponse.thumbnail || 'https://via.placeholder.com/300x200.png?text=No+Thumbnail'
        };
    }
    
    /**
     * 检测视频源类型
     * @param {string} url - 视频链接
     * @returns {string|null} 视频源类型或null
     */
    static detectVideoSource(url) {
        if (url.includes('douyin.com') || url.includes('iesdouyin.com')) {
            return 'douyin';
        } else if (url.includes('bilibili.com') || url.includes('b23.tv')) {
            return 'bilibili';
        } else if (url.includes('youtube.com') || url.includes('youtu.be')) {
            return 'youtube';
        } else if (url.includes('vimeo.com')) {
            return 'vimeo';
        } else if (url.includes('youku.com')) {
            return 'youku';
        } else if (url.includes('mgtv.com')) {
            return 'mgtv';
        } else if (url.includes('iqiyi.com')) {
            return 'iqiyi';
        } else if (url.includes('qq.com')) {
            return 'qq';
        } else if (url.includes('kuaishou.com') || url.includes('gifshow.com')) {
            return 'kuaishou';
        } else if (url.includes('ixigua.com')) {
            return 'xigua';
        } else if (url.includes('weibo.com') || url.includes('weibocdn.com')) {
            return 'weibo';
        } else if (url.includes('haokan.baidu.com')) {
            return 'haokan';
        } else if (url.includes('tiktok.com')) {
            return 'tiktok';
        }
        return null;
    }
    
    /**
     * 下载视频
     * @param {string} url - 视频链接
     * @param {Object} options - 下载选项
     * @returns {Promise<string>} 下载链接
     */
    static async downloadVideo(url, options = {}) {
        try {
            // 获取视频信息和下载链接
            const videoInfo = await this.extractVideoInfoWithDownloadUrl(url);
            
            // 选择合适的格式
            const selectedFormat = videoInfo.formats[0] || { quality: '原画', format: 'mp4', size: '未知', url: '' };
            
            if (!selectedFormat.url) {
                throw new Error('无法获取视频下载链接');
            }
            
            return {
                url: selectedFormat.url,
                filename: `${videoInfo.title.replace(/[<>:"/\\|?*]/g, '_')}_${selectedFormat.quality}.${selectedFormat.format}`,
                size: selectedFormat.size,
                quality: selectedFormat.quality,
                format: selectedFormat.format
            };
        } catch (error) {
            console.error('下载视频失败:', error);
            throw new Error(`无法下载视频: ${error.message}`);
        }
    }
    
    /**
     * 获取支持的视频源列表
     * @returns {Array<string>} 支持的视频源列表
     */
    static getSupportedSources() {
        return [
            'douyin',
            'bilibili', 
            'youtube', 
            'vimeo', 
            'youku', 
            'mgtv', 
            'iqiyi', 
            'qq',
            'kuaishou',
            'xigua',
            'weibo',
            'haokan',
            'tiktok'
        ];
    }
    
    /**
     * 批量提取视频信息
     * @param {Array<string>} urls - 视频链接数组
     * @returns {Promise<Array<Object>>} 视频信息数组
     */
    static async extractBatchVideoInfo(urls) {
        const results = [];
        
        // 使用本地服务器的批量API
        try {
            const response = await fetch(`${this.BASE_URL}/api/video/batch-info`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ urls })
            });
            
            if (!response.ok) {
                throw new Error(`服务器错误: ${response.status} ${response.statusText}`);
            }
            
            const batchData = await response.json();
            
            if (batchData.error) {
                throw new Error(batchData.error);
            }
            
            // 转换结果格式以匹配前端预期
            for (const result of batchData.results) {
                if (result.success) {
                    results.push({ 
                        url: result.url, 
                        info: this.transformApiResponse(result.info), 
                        success: true 
                    });
                } else {
                    results.push({ 
                        url: result.url, 
                        error: result.error, 
                        success: false 
                    });
                }
            }
        } catch (error) {
            console.error('批量获取视频信息失败:', error);
            
            // 如果批量API失败，回退到逐个处理
            for (const url of urls) {
                try {
                    const info = await this.extractVideoInfo(url);
                    results.push({ url, info, success: true });
                } catch (error) {
                    results.push({ url, error: error.message, success: false });
                }
            }
        }
        
        return results;
    }
    
    /**
     * 格式化观看次数
     * @param {number} count - 观看次数
     * @returns {string} 格式化后的观看次数
     */
    static formatViewCount(count) {
        if (!count) return '未知';
        
        if (count >= 1000000) {
            return `${(count / 1000000).toFixed(1)}M`;
        }
        if (count >= 1000) {
            return `${(count / 1000).toFixed(1)}K`;
        }
        return count.toString();
    }
}

// 导出模块（如果在Node.js环境中）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = VideoExtractor;
}