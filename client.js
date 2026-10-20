/*
 * dsh-visual-deck —— 客户端半边：设置页里的「启动动画与背景」。
 *
 * 视图职责：
 *   - 九宫格式素材墙（图片显示原图、视频抓首帧当封面）；
 *   - 导入本地文件（拖拽不做，走文件选择器 + 上传进度）；
 *   - 选中一条后：设为启动动画 / 设为会话背景 / 删除；
 *   - 纠错第一道闸：选中的不是视频时，「设为启动动画」置灰且点了没反应，
 *     并给出一句为什么（不是靠 alert 教训人）。
 *
 * 可见文案：中文原串就是文案；只有界面语言是英文时才查 en 词典（见 makeTranslator）。
 */
window.__ModuleLoader__.load({
  id: 'dsh-visual-deck',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'dsh-visual-deck'
    const STATE_URL = '/visual-deck/api/state'
    const UPLOAD_URL = '/visual-deck/api/upload'
    const SETTINGS_URL = '/visual-deck/api/settings'
    const ITEM_URL = '/visual-deck/api/item'
    const REPORT_URL = '/visual-deck/api/client-report'
    const MAX_BYTES = 200 * 1024 * 1024

    const VIDEO_EXT = ['.mp4', '.m4v', '.webm', '.mov', '.ogv']
    const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif']

    /** 英文词典：键是中文原串，缺条目时自动回落成中文。 */
    const en = {
      $locale: 'en',
      启动动画与背景: 'Startup animation & background',
      '导入本地图片或视频：视频可设为启动动画，图片或视频可设为会话背景。':
        'Import local images or videos: a video can become the startup animation, an image or video can become the session background.',
      启动动画: 'Startup animation',
      会话背景: 'Session background',
      未设置: 'Not set',
      导入本地文件: 'Import local file',
      刷新: 'Refresh',
      '支持图片与视频，单个文件不超过 200 MB': 'Images or videos, up to 200 MB per file',
      '支持图片与视频，单个文件不超过 200 MB，也可以 Ctrl+V 粘贴':
        'Images or videos, up to 200 MB per file — or just paste with Ctrl+V',
      设为启动动画: 'Set as startup animation',
      设为会话背景: 'Set as session background',
      删除: 'Delete',
      清除启动动画: 'Clear startup animation',
      清除背景: 'Clear background',
      '启动动画只接受视频文件；选中图片时该按钮不可用。':
        'The startup animation accepts videos only; the button is disabled for images.',
      '启动动画带声音播放（被系统拦下时自动静音）；会话背景里的视频始终静音、循环播放。':
        'The startup animation plays with sound (falls back to muted if blocked); background videos stay muted and looping.',
      还没有素材: 'No media yet',
      '点上面的「导入本地文件」，把图片或视频加进来。': 'Use "Import local file" above to add an image or video.',
      视频: 'Video',
      图片: 'Image',
      '已设为启动动画': 'Startup animation',
      '已设为背景': 'Background',
      '正在上传': 'Uploading',
      '上传失败': 'Upload failed',
      '读取素材列表失败': 'Failed to load media list',
      重试: 'Retry',
      '确定': 'OK',
      取消: 'Cancel',
      '文件太大': 'File too large',
      '这个文件超过 200 MB 上限，换个小一点的吧。': 'This file exceeds the 200 MB limit. Pick a smaller one.',
      '不支持的格式': 'Unsupported format',
      '只支持 mp4 / webm / mov / m4v / ogv 视频，或 png / jpg / webp / gif / avif 图片。':
        'Only mp4 / webm / mov / m4v / ogv videos, or png / jpg / webp / gif / avif images.',
      '删除这条素材？': 'Delete this item?',
      '删除后文件会从磁盘移除，正在使用它的话会一并取消。':
        'The file is removed from disk; any use of it is cleared too.',
      预览启动动画: 'Preview startup animation',
      拖到这里: 'Drop here',
      或点击选择文件: 'or click to choose files',
      '拖拽图片或视频到这里，或点击选择': 'Drag images or videos here, or click to choose',
      '图片或视频 · ≤ 200 MB': 'Images or videos · ≤ 200 MB',
      背景强度: 'Background strength',
      背景模糊: 'Background blur',
      播放时机: 'Playback',
      每次启动: 'Every launch',
      每天一次: 'Once a day',
      仅首次: 'First time only',
      壁纸: 'Wallpaper',
      显示壁纸: 'Show wallpaper',
      已开启: 'On',
      已关闭: 'Off',
      '已临时关闭，界面回到原生外观（只影响这一页）': 'Off for now — the UI looks native again (this page only)',
      '拖动窗口或录屏时可以临时关掉，不用改设置': 'Turn it off temporarily when dragging windows or recording',
      '0% 接近原生，100% 壁纸最清楚': '0% looks native, 100% shows the wallpaper most clearly',
      '松开鼠标，导入到素材库': 'Release to import into the library',
      '先设一个启动动画，或选中一个视频': 'Set a startup animation first, or select a video',
      打开配置文件: 'Open config file',
      素材配置: 'Media config',
      素材配置文件: 'Media config file',
      配置文件: 'Config file',
      关闭: 'Close',
      清除: 'Clear',
      启动: 'Startup',
      背景: 'Background',
      '只读展示；要改的话直接编辑这个文件，然后刷新页面。':
        'Read-only view; edit this file directly and reload the page to apply changes.',
      '预览需要刷新一次页面（运行时还是旧版本）': 'Preview needs a page reload (the runtime is still the old version)',
      '这条素材不能预览（不是视频）': 'This item cannot be previewed (not a video)',
      '图片不能设为启动动画': 'Images cannot be the startup animation',
      '启动动画只能使用视频文件。换一个视频，或者把它设为会话背景。':
        'The startup animation needs a video file. Pick a video, or use this as the session background.',
      '背景层：未注入（重启应用一次后生效）': 'Background layer: not injected yet (restart the app once)',
      '背景层：已生效': 'Background layer: active',
      '背景层：未生效（素材还没显示出来）': 'Background layer: inactive (media has not rendered)',
      '背景层：未设置': 'Background layer: not set',
    }

    function fmtSize(bytes) {
      const n = Number(bytes) || 0
      if (n < 1024) return n + ' B'
      if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB'
      return (n / 1024 / 1024).toFixed(1) + ' MB'
    }

    /** 按文件名/类型判断这条素材属于哪一类；判断不出来时返回 null。 */
    function kindOf(file) {
      const name = String(file.name || '').toLowerCase()
      const dot = name.lastIndexOf('.')
      const ext = dot >= 0 ? name.slice(dot) : ''
      if (VIDEO_EXT.indexOf(ext) >= 0) return 'video'
      if (IMAGE_EXT.indexOf(ext) >= 0) return 'image'
      const type = String(file.type || '')
      if (type.indexOf('video/') === 0) return 'video'
      if (type.indexOf('image/') === 0) return 'image'
      return null
    }

    async function readState() {
      const response = await fetch(STATE_URL, { cache: 'no-store', credentials: 'same-origin' })
      if (!response.ok) throw new Error('HTTP ' + response.status)
      return response.json()
    }

    async function postJson(url, body) {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      })
      let data = null
      try {
        data = await response.json()
      } catch (error) {
        data = null
      }
      if (!response.ok || !data || data.ok !== true) {
        const message = (data && (data.message || data.error)) || 'HTTP ' + response.status
        throw new Error(message)
      }
      return data
    }

    async function deleteItem(id) {
      const response = await fetch(ITEM_URL + '?id=' + encodeURIComponent(id), {
        method: 'DELETE',
        credentials: 'same-origin',
      })
      let data = null
      try {
        data = await response.json()
      } catch (error) {
        data = null
      }
      if (!response.ok || !data || data.ok !== true) throw new Error('HTTP ' + response.status)
      return data
    }

    /** 原始字节上传（用 XHR 只为拿进度；fetch 没有上传进度）。 */
    function uploadFile(file, kind, onProgress) {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open(
          'POST',
          UPLOAD_URL + '?name=' + encodeURIComponent(file.name) + '&kind=' + kind,
        )
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) onProgress(event.loaded / event.total)
        })
        xhr.addEventListener('load', () => {
          let data = null
          try {
            data = JSON.parse(xhr.responseText)
          } catch (error) {
            data = null
          }
          if (xhr.status >= 200 && xhr.status < 300 && data && data.ok === true) resolve(data)
          else reject(new Error((data && (data.message || data.error)) || 'HTTP ' + xhr.status))
        })
        xhr.addEventListener('error', () => reject(new Error('网络错误')))
        xhr.addEventListener('abort', () => reject(new Error('已取消')))
        xhr.send(file)
      })
    }

    /**
     * 把界面里所有"有实心底色/背景图"的元素采下来（最多 240 个）。
     *
     * 用途单一：壁纸挂上了却看不见，多半是某层容器用了不透明底色。

     * 只读 computed style，不改任何东西；采集结果交给宿主落盘，用来看清是哪个容器。
     * @returns {Record<string, unknown>}
     */
    function collectLayers() {
      const elements = []
      try {
        const all = document.body.querySelectorAll('*')
        for (let i = 0; i < all.length && elements.length < 240; i += 1) {
          const el = all[i]
          const style = getComputedStyle(el)
          const bg = style.backgroundColor
          const image = style.backgroundImage
          const hasColor = bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent'
          const hasImage = image && image !== 'none'
          if (!hasColor && !hasImage) continue
          const rect = el.getBoundingClientRect()
          elements.push({
            tag: el.tagName.toLowerCase(),
            id: el.id || '',
            role: el.getAttribute('role') || '',
            ariaModal: el.getAttribute('aria-modal') || '',
            cls: typeof el.className === 'string' ? el.className.slice(0, 90) : '',
            bg: bg,
            image: hasImage ? image.slice(0, 80) : '',
            position: style.position,
            zIndex: style.zIndex,
            size: Math.round(rect.width) + 'x' + Math.round(rect.height),
          })
        }
      } catch (error) {
        /* 采集中断就返回已采到的部分 */
      }
      return {
        at: new Date().toISOString(),
        href: String(location.href),
        attr: document.documentElement.getAttribute('data-vd'),
        elements,
      }
    }

    /** 让运行中的背景/动画立即重新读一次设置（设置页改完就不用刷新整页）。 */
    function notifyRuntime() {
      try {
        if (window.__DSH_VISUAL_DECK__ && typeof window.__DSH_VISUAL_DECK__.reload === 'function') {
          window.__DSH_VISUAL_DECK__.reload()
        }
        window.dispatchEvent(new Event('vd:changed'))
      } catch (error) {
        /* 运行时不在就算了，下次刷新页面照样生效 */
      }
    }

    /**
     * 量一下背景层现在的真实状态（只读，不改 DOM）。
     *
     * 为什么要量这么多：注入脚本跑没跑、层建没建、图解码没解码、界面底色透没透，
     * 这四件事任何一件不对，现象都是"背景是黑的"。量出来才能一次说清是哪一件。
     * @returns {Record<string, unknown>}
     */
    function readRuntimeState() {
      const out = {
        installed: false,
        on: false,
        layer: false,
        shown: '无',
        kind: '',
        htmlBg: '?',
        bodyBg: '?',
        layerZ: '?',
        origin: '?',
        paused: false,
      }
      try {
        out.origin = String(location.protocol) + '//' + String(location.host)
        out.paused = document.documentElement.getAttribute('data-vd-paused') === '1'
        out.installed = Boolean(
          window.__DSH_VISUAL_DECK__ && window.__DSH_VISUAL_DECK__.__installed === true,
        )
        out.on = document.documentElement.getAttribute('data-vd') === 'on'
        const layer = document.getElementById('vd-backdrop')
        out.layer = layer !== null
        if (layer) {
          out.layerZ = getComputedStyle(layer).zIndex
          const media = layer.querySelector('img, video')
          if (media) {
            out.shown = media.dataset.shown || '0'
            out.kind = media.dataset.kind || ''
          }
        }
        out.htmlBg = getComputedStyle(document.documentElement).backgroundColor
        out.bodyBg = getComputedStyle(document.body).backgroundColor
      } catch (error) {
        out.error = String(error && error.message ? error.message : error)
      }
      return out
    }

    /**
     * 在页面里直接试加载一次素材 URL：能解码出尺寸就是 ok。
     * @param {any} item 素材。
     * @returns {Promise<string>} 结果文本。
     */
    function probeMedia(item) {
      return new Promise((resolve) => {
        if (!item) {
          resolve('无素材')
          return
        }
        let settled = false
        const finish = (text) => {
          if (settled) return
          settled = true
          resolve(text)
        }
        try {
          const img = new Image()
          img.onload = () => finish('ok ' + img.naturalWidth + 'x' + img.naturalHeight)
          img.onerror = () => finish('error')
          setTimeout(() => finish('timeout'), 6000)
          img.src = '/visual-deck/media?id=' + encodeURIComponent(item.id)
        } catch (error) {
          finish('error')
        }
      })
    }

    const CSS = `
.vd-root { position: relative; display: flex; flex-direction: column; gap: 16px; padding: 2px 0 20px; color: var(--dsw-alias-label-primary); font-size: 13px; }
.vd-head { display: flex; flex-direction: column; gap: 6px; }
.vd-head-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.vd-title { font-size: 15px; font-weight: 600; letter-spacing: 0.02em; }
.vd-desc { font-size: 12.5px; line-height: 1.6; color: var(--dsw-alias-label-secondary); }
.vd-summary { display: flex; flex-wrap: wrap; gap: 18px; }
.vd-chip { display: inline-flex; align-items: baseline; gap: 6px; font-size: 12.5px; color: var(--dsw-alias-label-secondary); }
.vd-chip b { font-weight: 600; color: var(--dsw-alias-label-primary); max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vd-link { appearance: none; font: inherit; font-size: 11.5px; padding: 0; margin-left: 2px; border: none; background: none; cursor: pointer; color: var(--dsw-alias-label-secondary); text-decoration: underline; text-underline-offset: 2px; }
.vd-link:hover:not(:disabled) { color: var(--dsw-alias-label-primary); }
.vd-link:disabled { opacity: 0.4; cursor: not-allowed; }
.vd-toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.vd-hint { font-size: 11.5px; color: var(--dsw-alias-label-secondary); }
.vd-btn { appearance: none; font: inherit; font-size: 12.5px; line-height: 1.2; padding: 7px 12px; border-radius: 8px; cursor: pointer; color: var(--dsw-alias-label-primary); background: transparent; border: 1px solid var(--dsw-alias-border-l2); transition: background 140ms ease, border-color 140ms ease, opacity 140ms ease; }
.vd-btn:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2); }
.vd-btn:disabled { opacity: 0.45; cursor: not-allowed; }
/* 强调按钮不做"反色实心"：背景层生效时 --dsw-alias-bg-base 本身被改成了半透明，
   拿它当文字色就是"白底近乎透明的字"。改成淡底 + 亮边框，任何主题下都成立。 */
.vd-btn-primary { background: var(--dsw-alias-bg-layer-2); border-color: var(--dsw-alias-label-secondary); font-weight: 500; }
.vd-btn-primary:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-3); border-color: var(--dsw-alias-label-primary); }
.vd-btn-danger:not(:disabled) { color: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-primary); }
.vd-btn-danger:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2); }
.vd-btn-ghost { background: transparent; border-color: transparent; color: var(--dsw-alias-label-secondary); }
.vd-btn-ghost:hover:not(:disabled) { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-2); }
/* 三列大图墙：贴着草图来。窄面板退成两列，别把卡片压成竖条。 */
.vd-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
@media (max-width: 720px) { .vd-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.vd-card { position: relative; display: block; padding: 0; text-align: left; cursor: pointer; border-radius: 10px; overflow: hidden; color: inherit; background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1); transition: border-color 140ms ease, background 140ms ease; }
.vd-card:hover { border-color: var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); }
.vd-card:focus-visible { outline: 2px solid var(--dsw-alias-label-primary); outline-offset: 2px; }
.vd-card-sel { border-color: var(--dsw-alias-label-primary); outline: 2px solid var(--dsw-alias-label-primary); outline-offset: -2px; }
.vd-thumb { position: relative; aspect-ratio: 16 / 9; overflow: hidden; background: #0b1118; }
.vd-media { display: block; width: 100%; height: 100%; object-fit: cover; }
.vd-hover { position: absolute; inset: auto 0 0 0; display: flex; justify-content: flex-end; gap: 6px; padding: 22px 8px 8px; background: linear-gradient(transparent, rgba(0, 0, 0, 0.62)); opacity: 0; transition: opacity 140ms ease; }
.vd-card:hover .vd-hover, .vd-card:focus-within .vd-hover { opacity: 1; }
.vd-hover-btn { appearance: none; font: inherit; font-size: 11px; line-height: 1.2; padding: 5px 9px; border-radius: 6px; cursor: pointer; color: #f2f7ff; background: rgba(12, 20, 32, 0.72); border: 1px solid rgba(198, 220, 246, 0.32); }
.vd-hover-btn:hover:not(:disabled) { background: rgba(24, 38, 58, 0.9); border-color: rgba(198, 220, 246, 0.55); }
.vd-hover-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.vd-hover-danger { color: #ffd0d0; border-color: rgba(255, 150, 150, 0.45); }
/* 网格第一格：把"能拖拽"这件事摆在明面上。 */
.vd-import { border-style: dashed; background: transparent; }
.vd-import:hover { background: var(--dsw-alias-bg-layer-1); border-color: var(--dsw-alias-label-secondary); }
.vd-import-hot { border-color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-2); }
.vd-import-inner { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; aspect-ratio: 16 / 9; color: var(--dsw-alias-label-secondary); border-bottom: 1px solid var(--dsw-alias-border-l1); }
.vd-import-title { font-size: 12.5px; color: var(--dsw-alias-label-primary); }
.vd-import-sub { font-size: 11px; }
.vd-badge { position: absolute; left: 6px; top: 6px; padding: 2px 7px; border-radius: 999px; font-size: 10.5px; letter-spacing: 0.04em; color: #eaf4ff; background: rgba(8, 14, 24, 0.62); border: 1px solid rgba(198, 220, 246, 0.22); }
.vd-flags { position: absolute; right: 6px; top: 6px; display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 4px; max-width: 72%; }
.vd-flag { padding: 2px 7px; border-radius: 999px; font-size: 10.5px; color: #f2f7ff; background: rgba(8, 14, 24, 0.66); border: 1px solid rgba(198, 220, 246, 0.28); }
.vd-card-name { padding: 8px 10px 0; font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.vd-card-meta { padding: 2px 10px 9px; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.vd-card-body { padding: 9px 11px 10px; }
.vd-card-name { font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.vd-card-meta { margin-top: 3px; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.vd-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.vd-bottom { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; padding-top: 4px; border-top: 1px solid var(--dsw-alias-border-l1); }
.vd-bottom-side { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.vd-group { display: flex; flex-direction: column; gap: 12px; padding: 12px 14px; border-radius: 10px; border: 1px solid var(--dsw-alias-border-l1); }
.vd-group-title { font-size: 12px; font-weight: 600; letter-spacing: 0.04em; color: var(--dsw-alias-label-secondary); }
.vd-seg { display: inline-flex; align-self: flex-start; border-radius: 8px; overflow: hidden; border: 1px solid var(--dsw-alias-border-l2); }
.vd-seg-btn { appearance: none; font: inherit; font-size: 12px; padding: 6px 11px; background: transparent; color: var(--dsw-alias-label-secondary); border: none; border-right: 1px solid var(--dsw-alias-border-l1); cursor: pointer; }
.vd-seg-btn:last-child { border-right: none; }
.vd-seg-btn:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
/* 选中态要"一眼看出"：底色 + 内描边 + 加粗，而不是只靠一点点 alpha 差。 */
.vd-seg-on { background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-label-primary); font-weight: 600; box-shadow: inset 0 0 0 1px var(--dsw-alias-label-primary); }
.vd-seg-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.vd-row-sep { margin-top: 2px; padding-top: 12px; border-top: 1px solid var(--dsw-alias-border-l1); }
/* 拨动开关：开=绿、关=红。颜色用主题的语义色 token（自带亮/暗两套），
   不写死具体色值；位置 + 颜色两重信号，不依赖文字说明。 */
.vd-switch { position: relative; flex: none; width: 38px; height: 20px; padding: 0; border-radius: 999px; border: 1px solid var(--dsw-alias-state-error-primary); background: transparent; cursor: pointer; transition: background 160ms ease, border-color 160ms ease; }
.vd-switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: var(--dsw-alias-state-error-primary); transition: transform 160ms ease, background 160ms ease; }
.vd-switch[aria-checked="true"] { background: var(--dsw-alias-state-success-primary); border-color: var(--dsw-alias-state-success-primary); }
.vd-switch[aria-checked="true"]::after { transform: translateX(18px); background: #ffffff; }
.vd-switch:hover { filter: brightness(1.12); }
.vd-switch:focus-visible { outline: 2px solid var(--dsw-alias-label-primary); outline-offset: 2px; }
.vd-row { display: flex; flex-direction: column; gap: 7px; max-width: 340px; }
.vd-row-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; font-size: 12.5px; color: var(--dsw-alias-label-secondary); }
.vd-row-value { font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-primary); }
.vd-row-note { font-size: 11px; color: var(--dsw-alias-label-secondary); }
.vd-drop { position: absolute; inset: -8px; z-index: 6; display: flex; align-items: center; justify-content: center; border-radius: 12px; border: 2px dashed var(--dsw-alias-label-primary); background: rgba(8, 14, 24, 0.55); color: #f2f7ff; font-size: 13px; letter-spacing: 0.04em; pointer-events: none; }
.vd-range { -webkit-appearance: none; appearance: none; width: 100%; height: 3px; margin: 4px 0 0; border-radius: 3px; background: var(--dsw-alias-border-l2); outline: none; cursor: pointer; }
.vd-range::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 13px; height: 13px; border-radius: 50%; background: var(--dsw-alias-label-primary); box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35); cursor: pointer; }
.vd-range:focus-visible { outline: 2px solid var(--dsw-alias-label-primary); outline-offset: 4px; }
.vd-empty { padding: 34px 20px; text-align: center; border-radius: 12px; border: 1px dashed var(--dsw-alias-border-l2); color: var(--dsw-alias-label-secondary); }
.vd-empty b { display: block; margin-bottom: 4px; font-size: 13px; color: var(--dsw-alias-label-primary); }
.vd-note { font-size: 11.5px; line-height: 1.6; color: var(--dsw-alias-label-secondary); }
.vd-runtime { font-size: 11px; line-height: 1.5; color: var(--dsw-alias-label-secondary); opacity: 0.86; }
.vd-diag { display: flex; flex-direction: column; gap: 3px; align-items: flex-start; padding: 10px 12px; border-radius: 8px; font-family: ui-monospace, Consolas, monospace; font-size: 10.5px; line-height: 1.5; color: var(--dsw-alias-label-secondary); border: 1px solid var(--dsw-alias-border-l1); word-break: break-all; }
.vd-diag-title { font-family: inherit; font-size: 11.5px; color: var(--dsw-alias-state-warn-primary); }
.vd-diag-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 4px; font-family: inherit; }
.vd-diag-actions .vd-btn { padding: 4px 8px; font-size: 11px; }
.vd-error { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 9px 12px; border-radius: 9px; font-size: 12.5px; color: var(--dsw-alias-state-error-primary); border: 1px solid var(--dsw-alias-state-error-primary); }
.vd-progress { display: flex; align-items: center; gap: 10px; font-size: 11.5px; color: var(--dsw-alias-label-secondary); }
.vd-progress-track { flex: 1; height: 4px; border-radius: 999px; overflow: hidden; background: var(--dsw-alias-bg-layer-3); }
.vd-progress-fill { height: 100%; border-radius: 999px; background: var(--dsw-alias-label-primary); transition: width 120ms linear; }
.vd-mask { position: fixed; inset: 0; z-index: 2147483000; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(0, 0, 0, 0.42); }
.vd-modal { width: min(420px, 100%); border-radius: 12px; padding: 18px 18px 14px; background: var(--dsw-alias-bg-overlay); border: 1px solid var(--dsw-alias-border-l2); box-shadow: 0 24px 64px rgba(0, 0, 0, 0.35); }
.vd-modal-wide { width: min(680px, 100%); }
.vd-config-path { margin-bottom: 10px; font-family: ui-monospace, Consolas, monospace; font-size: 11px; line-height: 1.5; word-break: break-all; user-select: all; color: var(--dsw-alias-label-primary); }
.vd-config-note { margin-top: 10px; font-size: 11.5px; line-height: 1.5; color: var(--dsw-alias-label-secondary); }
.vd-code { max-height: 46vh; overflow: auto; margin: 0; padding: 10px 12px; border-radius: 8px; font-family: ui-monospace, Consolas, monospace; font-size: 11px; line-height: 1.5; white-space: pre; color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l1); }
.vd-modal-title { font-size: 14px; font-weight: 600; margin-bottom: 8px; }
.vd-modal-body { font-size: 12.5px; line-height: 1.7; color: var(--dsw-alias-label-secondary); word-break: break-word; white-space: pre-line; }
.vd-modal-foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.vd-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
`

    function Styles() {
      return h('style', { dangerouslySetInnerHTML: { __html: CSS } })
    }

    function Modal(props) {
      const { title, body, confirmLabel, cancelLabel, danger, wide, onConfirm, onCancel } = props
      React.useEffect(() => {
        function onKey(event) {
          if (event.key === 'Escape') {
            event.stopPropagation()
            onCancel()
          }
        }
        document.addEventListener('keydown', onKey, true)
        return () => document.removeEventListener('keydown', onKey, true)
      }, [onCancel])
      return h(
        'div',
        { className: 'vd-mask', onClick: onCancel },
        h(
          'div',
          {
            className: 'vd-modal' + (wide ? ' vd-modal-wide' : ''),
            role: 'dialog',
            'aria-modal': 'true',
            onClick: (event) => event.stopPropagation(),
          },
          h('div', { className: 'vd-modal-title' }, title),
          h('div', { className: 'vd-modal-body' }, body),
          h(
            'div',
            { className: 'vd-modal-foot' },
            cancelLabel
              ? h('button', { type: 'button', className: 'vd-btn', onClick: onCancel }, cancelLabel)
              : null,
            h(
              'button',
              {
                type: 'button',
                className: danger ? 'vd-btn vd-btn-danger' : 'vd-btn vd-btn-primary',
                onClick: onConfirm,
                autoFocus: true,
              },
              confirmLabel || 'OK',
            ),
          ),
        ),
      )
    }

    function Card(props) {
      const { item, selected, isBackground, isBoot, onSelect, onBoot, onBackground, onDelete } = props
      // 卡片是模块级组件，拿不到 Panel 的闭包：`t` 由父组件传进来，缺了就退回原串
      // （宁可少一层翻译，也不能因为一个没传的 prop 把整块面板打崩）。
      const t = typeof props.t === 'function' ? props.t : (key) => key
      const src =
        '/visual-deck/media?id=' + encodeURIComponent(item.id) + (item.kind === 'video' ? '#t=0.4' : '')
      const act = (fn) => (event) => {
        event.stopPropagation()
        fn(item.id)
      }
      return h(
        'div',
        {
          className: 'vd-card' + (selected ? ' vd-card-sel' : ''),
          role: 'button',
          tabIndex: 0,
          onClick: () => onSelect(item.id),
          onKeyDown: (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onSelect(item.id)
            }
          },
          'aria-pressed': selected ? 'true' : 'false',
          title: item.name,
        },
        h(
          'div',
          { className: 'vd-thumb' },
          item.kind === 'video'
            ? h('video', {
                className: 'vd-media',
                src,
                muted: true,
                preload: 'metadata',
                playsInline: true,
                tabIndex: -1,
              })
            : h('img', { className: 'vd-media', src, alt: '', loading: 'lazy', decoding: 'async' }),
          h('span', { className: 'vd-badge' }, item.kind === 'video' ? '视频' : '图片'),
          isBoot || isBackground
            ? h(
                'div',
                { className: 'vd-flags' },
                isBoot ? h('span', { className: 'vd-flag' }, '启动') : null,
                isBackground ? h('span', { className: 'vd-flag' }, '背景') : null,
              )
            : null,
          // 悬停/聚焦时出现的快捷操作：不用先选中再点底栏。
          h(
            'div',
            { className: 'vd-hover' },
            h(
              'button',
              {
                type: 'button',
                className: 'vd-hover-btn',
                disabled: item.kind !== 'video',
                title: item.kind === 'video' ? t('设为启动动画') : t('启动动画只接受视频文件；选中图片时该按钮不可用。'),
                onClick: act(onBoot),
              },
              t('启动'),
            ),
            h(
              'button',
              { type: 'button', className: 'vd-hover-btn', onClick: act(onBackground) },
              t('背景'),
            ),
            h(
              'button',
              { type: 'button', className: 'vd-hover-btn vd-hover-danger', onClick: act(onDelete) },
              t('删除'),
            ),
          ),
        ),
        h(
          'div',
          { className: 'vd-card-body' },
          h('div', { className: 'vd-card-name' }, item.name),
          h(
            'div',
            { className: 'vd-card-meta' },
            (item.kind === 'video' ? t('视频') : t('图片')) + ' · ' + fmtSize(item.size),
          ),
        ),
      )
    }

    /**
     * 设置页主体。
     * @param {{t: (key: string) => string}} props
     */
    function Panel(props) {
      const t = props.t
      const [view, setView] = React.useState(null)
      const [loadError, setLoadError] = React.useState(null)
      const [actionError, setActionError] = React.useState(null)
      const [selectedId, setSelectedId] = React.useState(null)
      const [uploading, setUploading] = React.useState(null)
      const [modal, setModal] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [runtime, setRuntime] = React.useState(readRuntimeState)
      const [mediaProbe, setMediaProbe] = React.useState('')
      const [diagNote, setDiagNote] = React.useState('')
      // 页面刚打开时运行时可能还没跑完，先别急着判"未生效"（否则会闪一下红字）。
      const [settled, setSettled] = React.useState(false)
      // 音量：拖动时先记草稿值，落盘有 260ms 防抖（见下面的 changeVolume）。
      const [volumeDraft, setVolumeDraft] = React.useState(null)
      const volumeTimer = React.useRef(0)
      // 背景强度 / 模糊同理；dragDepth 用来抵消子元素之间的 dragenter/dragleave 抖动。
      const [strengthDraft, setStrengthDraft] = React.useState(null)
      const strengthTimer = React.useRef(0)
      const [blurDraft, setBlurDraft] = React.useState(null)
      const blurTimer = React.useRef(0)
      const [dragging, setDragging] = React.useState(false)
      const dragDepth = React.useRef(0)
      const fileInput = React.useRef(null)
      // 粘贴监听只挂一次，靠这个 ref 拿到最新的上传函数（避免闭包拿到旧 state）。
      const handleFilesRef = React.useRef(() => {})

      React.useEffect(
        () => () => {
          if (volumeTimer.current) clearTimeout(volumeTimer.current)
          if (strengthTimer.current) clearTimeout(strengthTimer.current)
          if (blurTimer.current) clearTimeout(blurTimer.current)
        },
        [],
      )

      // Ctrl+V 直接导入：截图工具复制的内容会以 File 出现在剪贴板里。
      // 只处理"带文件"的粘贴，普通文字粘贴不受影响。
      React.useEffect(() => {
        const onPaste = (event) => {
          const data = event.clipboardData
          if (!data) return
          const files = Array.from(data.files || [])
          if (files.length === 0) return
          event.preventDefault()
          handleFilesRef.current(files)
        }
        document.addEventListener('paste', onPaste)
        return () => document.removeEventListener('paste', onPaste)
      }, [])

      const load = React.useCallback(async (keepSelection) => {
        try {
          setLoadError(null)
          const next = await readState()
          setView(next)
          if (keepSelection !== true) {
            setSelectedId((current) => {
              if (current && Array.isArray(next.items) && next.items.some((i) => i.id === current)) {
                return current
              }
              return null
            })
          }
        } catch (error) {
          setLoadError(String(error && error.message ? error.message : error))
        }
      }, [])

      React.useEffect(() => {
        load()
      }, [load])

      // 每秒重读一次运行时状态：刚保存设置时运行时的生效是异步的，读一次会读到旧值。
      // 值没变就返回同一个对象，React 会跳过重渲染。
      React.useEffect(() => {
        const timer = setInterval(() => {
          const next = readRuntimeState()
          setRuntime((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
        }, 1000)
        return () => clearInterval(timer)
      }, [])

      // 1.5 秒后才允许判"未生效"：运行时是页面级脚本，可能比面板晚一步跑完。
      React.useEffect(() => {
        const timer = setTimeout(() => setSettled(true), 1500)
        return () => clearTimeout(timer)
      }, [])

      const backgroundId = (view && view.settings && view.settings.backgroundId) || null

      // 诊断用：拿当前背景素材在页面里真加载一次，确认 URL 和解码都没问题。
      React.useEffect(() => {
        let alive = true
        setMediaProbe('')
        if (backgroundId === null) return () => { alive = false }
        const item = (view.items || []).find((entry) => entry.id === backgroundId)
        if (!item) return () => { alive = false }
        probeMedia(item).then((text) => {
          if (alive) setMediaProbe(text)
        })
        return () => {
          alive = false
        }
      }, [backgroundId, view])

      const items = view && Array.isArray(view.items) ? view.items : []
      const settings = (view && view.settings) || {}
      const selected = items.find((item) => item.id === selectedId) || null
      const canBoot = selected !== null && selected.kind === 'video'
      const bootName = (items.find((item) => item.id === settings.bootId) || {}).name || null
      const bgName = (items.find((item) => item.id === settings.backgroundId) || {}).name || null
      const backgroundItem = items.find((item) => item.id === settings.backgroundId) || null
      const volume = typeof settings.bootVolume === 'number' ? settings.bootVolume : 1
      const shownVolume = volumeDraft === null ? volume : volumeDraft
      const strength = typeof settings.backgroundStrength === 'number' ? settings.backgroundStrength : 0.75
      const shownStrength = strengthDraft === null ? strength : strengthDraft
      const blur = typeof settings.backgroundBlur === 'number' ? settings.backgroundBlur : 0
      const shownBlur = blurDraft === null ? blur : blurDraft
      const bootWhen =
        settings.bootWhen === 'daily' || settings.bootWhen === 'once' ? settings.bootWhen : 'always'
      const bootWhenOptions = [
        ['always', '每次启动'],
        ['daily', '每天一次'],
        ['once', '仅首次'],
      ]

      // 拖拽导入：在面板任意位置松手都能进素材库，拖进来时给一层提示。
      const onDragEnter = (event) => {
        if (!event.dataTransfer) return
        event.preventDefault()
        event.stopPropagation()
        dragDepth.current += 1
        const types = Array.from(event.dataTransfer.types || [])
        if (types.indexOf('Files') >= 0) setDragging(true)
      }
      const onDragOver = (event) => {
        event.preventDefault()
        event.stopPropagation()
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
      }
      const onDragLeave = (event) => {
        event.preventDefault()
        event.stopPropagation()
        dragDepth.current = Math.max(0, dragDepth.current - 1)
        if (dragDepth.current === 0) setDragging(false)
      }
      const onDrop = (event) => {
        event.preventDefault()
        event.stopPropagation()
        dragDepth.current = 0
        setDragging(false)
        const files = Array.from((event.dataTransfer && event.dataTransfer.files) || [])
        if (files.length > 0) handleFiles(files)
      }

      // 背景强度：先让运行时立刻改 CSS 变量（手感），260ms 后再落盘。
      const changeStrength = (next) => {
        const value = Math.min(1, Math.max(0, Math.round(next * 100) / 100))
        setStrengthDraft(value)
        try {
          const api = window.__DSH_VISUAL_DECK__
          if (api && typeof api.setStrength === 'function') api.setStrength(value)
        } catch (error) {
          /* 预览失败不影响保存 */
        }
        if (strengthTimer.current) clearTimeout(strengthTimer.current)
        strengthTimer.current = setTimeout(async () => {
          strengthTimer.current = 0
          try {
            const result = await postJson(SETTINGS_URL, { backgroundStrength: value })
            if (result && Array.isArray(result.items)) setView(result)
            // 宿主还是旧版时这一步会"成功但没存进去"：返回里没这个字段就直接说明。
            const saved = result && result.settings ? result.settings.backgroundStrength : undefined
            if (typeof saved !== 'number') {
              setActionError('背景强度还没保存：重启一次应用后生效')
            } else {
              setActionError(null)
            }
          } catch (error) {
            setActionError(String(error && error.message ? error.message : error))
          }
        }, 260)
      }

      // 背景模糊：同样是"先预览、后落盘"。
      const changeBlur = (next) => {
        const value = Math.round(Math.min(12, Math.max(0, next)) * 2) / 2
        setBlurDraft(value)
        try {
          const api = window.__DSH_VISUAL_DECK__
          if (api && typeof api.setBlur === 'function') api.setBlur(value)
        } catch (error) {
          /* 预览失败不影响保存 */
        }
        if (blurTimer.current) clearTimeout(blurTimer.current)
        blurTimer.current = setTimeout(async () => {
          blurTimer.current = 0
          try {
            const result = await postJson(SETTINGS_URL, { backgroundBlur: value })
            if (result && Array.isArray(result.items)) setView(result)
            const saved = result && result.settings ? result.settings.backgroundBlur : undefined
            if (typeof saved !== 'number') setActionError('背景模糊还没保存：重启一次应用后生效')
            else setActionError(null)
          } catch (error) {
            setActionError(String(error && error.message ? error.message : error))
          }
        }, 260)
      }

      // 播放时机：三选一，保存后立即刷新状态。
      const changeBootWhen = async (next) => {
        if (next === settings.bootWhen) return
        setBusy(true)
        setActionError(null)
        try {
          const result = await postJson(SETTINGS_URL, { bootWhen: next })
          if (result && Array.isArray(result.items)) setView(result)
          const saved = result && result.settings ? result.settings.bootWhen : undefined
          if (saved !== next) setActionError('播放时机还没保存：重启一次应用后生效')
        } catch (error) {
          setActionError(String(error && error.message ? error.message : error))
        } finally {
          setBusy(false)
        }
      }

      // 临时关掉壁纸：只作用于这一页，不写盘。
      const togglePaused = () => {
        const next = !runtime.paused
        try {
          const api = window.__DSH_VISUAL_DECK__
          if (api && typeof api.setPaused === 'function') api.setPaused(next)
        } catch (error) {
          /* 运行时不在就拉倒 */
        }
        setRuntime((prev) => ({ ...prev, paused: next, on: next ? false : prev.on }))
        window.setTimeout(() => setRuntime(readRuntimeState()), 120)
      }

      const changeVolume = (next) => {
        const value = Math.min(1, Math.max(0, Math.round(next * 100) / 100))
        setVolumeDraft(value)
        if (volumeTimer.current) clearTimeout(volumeTimer.current)
        volumeTimer.current = setTimeout(async () => {
          volumeTimer.current = 0
          try {
            const result = await postJson(SETTINGS_URL, { bootVolume: value })
            if (result && Array.isArray(result.items)) setView(result)
            // 宿主还是旧版时（没重启），这一步会"成功但没存进去"：
            // 返回里没有 bootVolume 或值对不上，就直接说清楚，别让滑杆假装生效。
            const saved = result && result.settings ? result.settings.bootVolume : undefined
            if (typeof saved !== 'number' || Math.abs(saved - value) > 0.005) {
              setActionError('音量还没保存：重启一次应用后生效')
            } else {
              setActionError(null)
            }
          } catch (error) {
            setActionError(String(error && error.message ? error.message : error))
          }
        }, 260)
      }

      // 预览目标：优先用选中的视频（方便"先看效果再决定要不要设"），否则用已设的启动动画。
      const previewTarget = selected && selected.kind === 'video' ? selected.id : settings.bootId
      const previewBlocked = !previewTarget

      const previewBoot = () => {
        try {
          const api = window.__DSH_VISUAL_DECK__
          if (!api || typeof api.preview !== 'function') {
            setActionError('预览需要刷新一次页面（运行时还是旧版本）')
            return
          }
          const ok = api.preview(previewTarget)
          if (!ok) setActionError('这条素材不能预览（不是视频）')
          else setActionError(null)
        } catch (error) {
          setActionError(String(error && error.message ? error.message : error))
        }
      }

      const afterChange = (next) => {
        if (next && Array.isArray(next.items)) setView(next)
        notifyRuntime()
      }

      const itemById = (id) => (typeof id === 'string' ? items.find((entry) => entry.id === id) || null : null)

      /** 把某条素材设为启动动画（只接受视频，其余走弹窗说明）。 */
      const applyBoot = async (id) => {
        const target = itemById(id)
        if (!target) return
        if (target.kind !== 'video') {
          setModal({
            kind: 'not-video',
            title: t('图片不能设为启动动画'),
            body: t('启动动画只能使用视频文件。换一个视频，或者把它设为会话背景。'),
          })
          return
        }
        setBusy(true)
        setActionError(null)
        try {
          const next = await postJson(SETTINGS_URL, { bootId: target.id })
          afterChange(next)
        } catch (error) {
          setActionError(String(error && error.message ? error.message : error))
        } finally {
          setBusy(false)
        }
      }

      /** 把某条素材设为会话背景（图片、视频都行）。 */
      const applyBackground = async (id) => {
        const target = itemById(id)
        if (!target) return
        setBusy(true)
        setActionError(null)
        try {
          const next = await postJson(SETTINGS_URL, { backgroundId: target.id })
          afterChange(next)
        } catch (error) {
          setActionError(String(error && error.message ? error.message : error))
        } finally {
          setBusy(false)
        }
      }

      /** 卡片上的「删除」：先确认，再动手。 */
      const requestDelete = (id) => {
        const target = itemById(id)
        if (target) setModal({ kind: 'delete', item: target })
      }

      const clearBoot = async () => {
        setBusy(true)
        try {
          const next = await postJson(SETTINGS_URL, { bootId: null })
          afterChange(next)
        } catch (error) {
          setActionError(String(error && error.message ? error.message : error))
        } finally {
          setBusy(false)
        }
      }

      const clearBackground = async () => {
        setBusy(true)
        try {
          const next = await postJson(SETTINGS_URL, { backgroundId: null })
          afterChange(next)
        } catch (error) {
          setActionError(String(error && error.message ? error.message : error))
        } finally {
          setBusy(false)
        }
      }

      const confirmDelete = async () => {
        const target = modal && modal.item
        setModal(null)
        if (!target) return
        setBusy(true)
        setActionError(null)
        try {
          const next = await deleteItem(target.id)
          if (selectedId === target.id) setSelectedId(null)
          afterChange(next)
        } catch (error) {
          setActionError(String(error && error.message ? error.message : error))
        } finally {
          setBusy(false)
        }
      }

      /** 文件选择器和拖拽共用的一套"校验 → 逐个上传"流程。 */
      const handleFiles = async (list) => {
        if (!Array.isArray(list) || list.length === 0) return

        // 先全部校验一遍：任何一个不合格都不开始传，避免"传了一半才报错"。
        for (const file of list) {
          if (file.size > MAX_BYTES) {
            setModal({
              kind: 'too-big',
              title: t('文件太大'),
              body:
                file.name +
                ' · ' +
                fmtSize(file.size) +
                '\n' +
                t('这个文件超过 200 MB 上限，换个小一点的吧。'),
            })
            return
          }
          if (kindOf(file) === null) {
            setModal({
              kind: 'bad-type',
              title: t('不支持的格式'),
              body: file.name + '\n' + t('只支持 mp4 / webm / mov / m4v / ogv 视频，或 png / jpg / webp / gif / avif 图片。'),
            })
            return
          }
        }

        setActionError(null)
        let lastItem = null
        for (const file of list) {
          const kind = kindOf(file)
          setUploading({ name: file.name, pct: 0 })
          try {
            const result = await uploadFile(file, kind, (ratio) => {
              setUploading({ name: file.name, pct: Math.max(0.02, Math.min(0.99, ratio)) })
            })
            lastItem = result.item || null
            if (result.items) setView(result)
          } catch (error) {
            setUploading(null)
            setActionError(t('上传失败') + '：' + file.name + ' · ' + String(error && error.message ? error.message : error))
            return
          }
        }
        setUploading(null)
        if (lastItem) setSelectedId(lastItem.id)
        await load(false)
        notifyRuntime()
      }

      const onFiles = (event) => {
        const list = Array.from((event.target && event.target.files) || [])
        if (event.target) event.target.value = ''
        handleFiles(list)
      }

      // 让挂在 document 上的粘贴监听始终用到最新一次渲染的这套流程。
      React.useEffect(() => {
        handleFilesRef.current = handleFiles
      })

      const head = h(
        'div',
        { className: 'vd-head' },
        h(Styles),
        h(
          'div',
          { className: 'vd-head-row' },
          h(
            'div',
            null,
            h('div', { className: 'vd-title' }, t('启动动画与背景')),
            h(
              'div',
              { className: 'vd-desc' },
              t('导入本地图片或视频：视频可设为启动动画，图片或视频可设为会话背景。'),
            ),
          ),
          h(
            'button',
            { type: 'button', className: 'vd-btn', onClick: () => setModal({ kind: 'config' }) },
            t('素材配置'),
          ),
        ),
      )

      const summary = h(
        'div',
        { className: 'vd-summary' },
        h(
          'span',
          { className: 'vd-chip' },
          t('启动动画'),
          '：',
          h('b', null, bootName || t('未设置')),
          settings.bootId
            ? h('button', { type: 'button', className: 'vd-link', onClick: clearBoot, disabled: busy }, t('清除'))
            : null,
        ),
        h(
          'span',
          { className: 'vd-chip' },
          t('会话背景'),
          '：',
          h('b', null, bgName || t('未设置')),
          settings.backgroundId
            ? h('button', { type: 'button', className: 'vd-link', onClick: clearBackground, disabled: busy }, t('清除'))
            : null,
        ),
        h('span', { className: 'vd-hint' }, t('支持图片与视频，单个文件不超过 200 MB，也可以 Ctrl+V 粘贴')),
      )

      // 底栏：左边"进货"，右边"设成什么"——和草图的排布一致。
      const bottomBar = h(
        'div',
        { className: 'vd-bottom' },
        h(
          'div',
          { className: 'vd-bottom-side' },
          h(
            'button',
            {
              type: 'button',
              className: 'vd-btn vd-btn-primary',
              onClick: () => fileInput.current && fileInput.current.click(),
              disabled: uploading !== null,
            },
            t('导入本地文件'),
          ),
          h(
            'input',
            {
              ref: fileInput,
              type: 'file',
              accept: 'video/*,image/*',
              multiple: true,
              className: 'vd-sr',
              onChange: onFiles,
            },
          ),
          h(
            'button',
            { type: 'button', className: 'vd-btn vd-btn-ghost', onClick: () => load(true), disabled: busy },
            t('刷新'),
          ),
        ),
        h(
          'div',
          { className: 'vd-bottom-side' },
          h(
            'button',
            {
              type: 'button',
              className: 'vd-btn vd-btn-primary',
              disabled: !canBoot || busy,
              title: canBoot ? undefined : t('启动动画只接受视频文件；选中图片时该按钮不可用。'),
              onClick: () => applyBoot(selectedId),
            },
            t('设为启动动画'),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'vd-btn',
              disabled: selected === null || busy,
              onClick: () => applyBackground(selectedId),
            },
            t('设为会话背景'),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'vd-btn vd-btn-ghost',
              disabled: busy || previewBlocked,
              title: previewBlocked ? t('先设一个启动动画，或选中一个视频') : undefined,
              onClick: previewBoot,
            },
            t('预览启动动画'),
          ),
        ),
      )

      const progress =
        uploading === null
          ? null
          : h(
              'div',
              { className: 'vd-progress' },
              h('span', null, t('正在上传') + ' ' + uploading.name),
              h(
                'div',
                { className: 'vd-progress-track' },
                h('div', { className: 'vd-progress-fill', style: { width: Math.round(uploading.pct * 100) + '%' } }),
              ),
            )

      const errorBox = (loadError || actionError)
        ? h(
            'div',
            { className: 'vd-error' },
            h('span', null, (loadError ? t('读取素材列表失败') + '：' + loadError : '') + (loadError && actionError ? ' · ' : '') + (actionError || '')),
            h(
              'button',
              { type: 'button', className: 'vd-btn vd-btn-ghost', onClick: () => load(true) },
              t('重试'),
            ),
          )
        : null

      // 第一格永远是"导入"：拖拽是个看不见的能力，得给它一个看得见的落点。
      const importTile = h(
        'div',
        {
          className: 'vd-card vd-import' + (dragging ? ' vd-import-hot' : ''),
          role: 'button',
          tabIndex: 0,
          title: t('拖拽图片或视频到这里，或点击选择'),
          onClick: () => fileInput.current && fileInput.current.click(),
          onKeyDown: (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              if (fileInput.current) fileInput.current.click()
            }
          },
        },
        h(
          'div',
          { className: 'vd-import-inner' },
          h(
            'svg',
            {
              viewBox: '0 0 24 24',
              width: 26,
              height: 26,
              fill: 'none',
              stroke: 'currentColor',
              strokeWidth: 1.6,
              strokeLinecap: 'round',
              strokeLinejoin: 'round',
              'aria-hidden': true,
            },
            h('path', { d: 'M12 15V4' }),
            h('path', { d: 'M7.5 8.5L12 4l4.5 4.5' }),
            h('path', { d: 'M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3' }),
          ),
          h('div', { className: 'vd-import-title' }, t('拖到这里')),
          h('div', { className: 'vd-import-sub' }, t('或点击选择文件')),
        ),
        h(
          'div',
          { className: 'vd-card-body' },
          h('div', { className: 'vd-card-name' }, t('导入本地文件')),
          h('div', { className: 'vd-card-meta' }, t('图片或视频 · ≤ 200 MB')),
        ),
      )

      const grid = h(
        'div',
        { className: 'vd-grid' },
        importTile,
        items.map((item) =>
          h(Card, {
            key: item.id,
            item,
            t,
            selected: item.id === selectedId,
            isBackground: settings.backgroundId === item.id,
            isBoot: settings.bootId === item.id,
            onSelect: setSelectedId,
            onBoot: applyBoot,
            onBackground: applyBackground,
            onDelete: requestDelete,
          }),
        ),
      )

      // 配置文件的真实内容：就是宿主写盘的那份 JSON（state 里只多一个 limits）。
      const configText = JSON.stringify(
        { version: view ? view.version : 1, items, settings },
        null,
        2,
      )
      const configPath =
        (view && typeof view.dataDir === 'string' && view.dataDir !== '' ? view.dataDir : '~/.dsh/visual-deck') +
        '/deck.json'

      const note = h(
        'div',
        { className: 'vd-note' },
        t('启动动画只接受视频文件；选中图片时该按钮不可用。'),
        h('br'),
        t('启动动画带声音播放（被系统拦下时自动静音）；会话背景里的视频始终静音、循环播放。'),
      )

      // 启动动画音量：拖的时候先改本地值（手感），260ms 后再落盘，避免每拖一格都发一次请求。
      const volumeRow = h(
        'div',
        { className: 'vd-row' },
        h(
          'div',
          { className: 'vd-row-head' },
          h('span', null, t('启动动画音量')),
          h('span', { className: 'vd-row-value' }, shownVolume <= 0 ? t('静音') : Math.round(shownVolume * 100) + '%'),
        ),
        h('input', {
          className: 'vd-range',
          type: 'range',
          min: 0,
          max: 1,
          step: 0.01,
          value: shownVolume,
          'aria-label': t('启动动画音量'),
          onChange: (event) => changeVolume(Number(event.target.value)),
        }),
      )

      // 背景强度：0% 界面接近原生（几乎看不见壁纸），100% 面板最透、壁纸最清楚。
      const strengthRow = h(
        'div',
        { className: 'vd-row' },
        h(
          'div',
          { className: 'vd-row-head' },
          h('span', null, t('背景强度')),
          h('span', { className: 'vd-row-value' }, Math.round(shownStrength * 100) + '%'),
        ),
        h('input', {
          className: 'vd-range',
          type: 'range',
          min: 0,
          max: 1,
          step: 0.01,
          value: shownStrength,
          'aria-label': t('背景强度'),
          onChange: (event) => changeStrength(Number(event.target.value)),
        }),
        h('div', { className: 'vd-row-note' }, t('0% 接近原生，100% 壁纸最清楚')),
      )

      // 模糊滑块。
      const blurRow = h(
        'div',
        { className: 'vd-row' },
        h(
          'div',
          { className: 'vd-row-head' },
          h('span', null, t('背景模糊')),
          h('span', { className: 'vd-row-value' }, Math.round(shownBlur) + ' px'),
        ),
        h('input', {
          className: 'vd-range',
          type: 'range',
          min: 0,
          max: 12,
          step: 0.5,
          value: shownBlur,
          'aria-label': t('背景模糊'),
          onChange: (event) => changeBlur(Number(event.target.value)),
        }),
      )

      // 播放时机：三选一的分段控件。
      const bootWhenRow = h(
        'div',
        { className: 'vd-row' },
        h('div', { className: 'vd-row-head' }, h('span', null, t('播放时机'))),
        h(
          'div',
          { className: 'vd-seg' },
          bootWhenOptions.map((option) =>
            h(
              'button',
              {
                key: option[0],
                type: 'button',
                className: 'vd-seg-btn' + (bootWhen === option[0] ? ' vd-seg-on' : ''),
                'aria-pressed': bootWhen === option[0],
                disabled: busy,
                onClick: () => changeBootWhen(option[0]),
              },
              // 选中的那一项带对勾：光靠底色差一点点，在深色主题里几乎看不出来。
              bootWhen === option[0] ? '✓ ' : '',
              t(option[1]),
            ),
          ),
        ),
      )

      // 临时开关壁纸（只作用于这一页）：单独一行 + 分隔线 + 拨动开关，
      // 不能贴着"背景模糊"，否则看起来像在关模糊。
      const pauseRow = h(
        'div',
        { className: 'vd-row vd-row-sep' },
        h(
          'div',
          { className: 'vd-row-head' },
          h('span', null, t('显示壁纸')),
          h(
            'button',
            {
              type: 'button',
              className: 'vd-switch',
              role: 'switch',
              'aria-checked': !runtime.paused,
              'aria-label': t('显示壁纸'),
              onClick: togglePaused,
            },
            h('span', { className: 'vd-sr' }, runtime.paused ? t('已关闭') : t('已开启')),
          ),
        ),
        h(
          'div',
          { className: 'vd-row-note' },
          runtime.paused
            ? t('已临时关闭，界面回到原生外观（只影响这一页）')
            : t('拖动窗口或录屏时可以临时关掉，不用改设置'),
        ),
      )

      const bootGroup = h(
        'div',
        { className: 'vd-group' },
        h('div', { className: 'vd-group-title' }, t('启动动画')),
        volumeRow,
        bootWhenRow,
      )

      const backgroundGroup = h(
        'div',
        { className: 'vd-group' },
        h('div', { className: 'vd-group-title' }, t('会话背景')),
        strengthRow,
        blurRow,
        pauseRow,
      )

      // 背景层状态：只在"设了背景却看得不对"的时候说话。
      // 一切正常时不占位置 —— 设置页里多一行技术细节只是噪音。
      const healthy = runtime.paused || (runtime.installed && runtime.on)
      const showDiagnostics = Boolean(settings.backgroundId) && settled && !healthy
      const sendReport = async () => {
        try {
          const payload = collectLayers()
          await postJson(REPORT_URL, payload)
          setDiagNote('已采集 ' + payload.elements.length + ' 个有底色的元素')
        } catch (error) {
          setDiagNote('采集失败：' + String(error && error.message ? error.message : error))
        }
      }
      const diagnostics = showDiagnostics
        ? h(
            'div',
            { className: 'vd-diag' },
            h(
              'div',
              { className: 'vd-diag-title' },
              runtime.installed
                ? t('背景层：未生效（素材还没显示出来）')
                : t('背景层：未注入（重启应用一次后生效）'),
            ),
            h(
              'div',
              null,
              '注=' + (runtime.installed ? '有' : '无') +
                ' · 属性=' + (runtime.on ? 'on' : '空') +
                ' · 层=' + (runtime.layer ? '有' : '无') +
                ' · 媒体=' + (runtime.kind || '无') + '/' + runtime.shown +
                ' · 探针=' + (mediaProbe || '…'),
            ),
            h(
              'div',
              null,
              '底色 html=' + runtime.htmlBg + ' · body=' + runtime.bodyBg +
                (runtime.layer ? ' · 层z=' + runtime.layerZ : '') +
                ' · 页面 ' + runtime.origin,
            ),
            h(
              'div',
              { className: 'vd-diag-actions' },
              h(
                'button',
                { type: 'button', className: 'vd-btn vd-btn-ghost', onClick: () => notifyRuntime() },
                '重新应用背景',
              ),
              h(
                'button',
                { type: 'button', className: 'vd-btn vd-btn-ghost', onClick: sendReport },
                '采集界面底色',
              ),
              diagNote ? h('span', null, diagNote) : null,
            ),
          )
        : null

      let modalNode = null
      if (modal) {
        if (modal.kind === 'delete') {
          modalNode = h(Modal, {
            title: t('删除这条素材？'),
            body: (modal.item && modal.item.name ? modal.item.name + '\n' : '') + t('删除后文件会从磁盘移除，正在使用它的话会一并取消。'),
            confirmLabel: t('删除'),
            cancelLabel: t('取消'),
            danger: true,
            onConfirm: confirmDelete,
            onCancel: () => setModal(null),
          })
        } else if (modal.kind === 'config') {
          modalNode = h(Modal, {
            title: t('素材配置文件'),
            wide: true,
            body: h(
              'div',
              null,
              h('div', { className: 'vd-config-path' }, configPath),
              h('pre', { className: 'vd-code' }, configText),
              h('div', { className: 'vd-config-note' }, t('只读展示；要改的话直接编辑这个文件，然后刷新页面。')),
            ),
            confirmLabel: t('关闭'),
            onConfirm: () => setModal(null),
            onCancel: () => setModal(null),
          })
        } else {
          modalNode = h(Modal, {
            title: modal.title,
            body: modal.body,
            confirmLabel: t('确定'),
            onConfirm: () => setModal(null),
            onCancel: () => setModal(null),
          })
        }
      }

      return h(
        'div',
        {
          className: 'vd-root',
          onDragEnter,
          onDragOver,
          onDragLeave,
          onDrop,
        },
        head,
        summary,
        progress,
        errorBox,
        grid,
        bottomBar,
        bootGroup,
        backgroundGroup,
        note,
        diagnostics,
        modalNode,
        dragging
          ? h('div', { className: 'vd-drop' }, t('松开鼠标，导入到素材库'))
          : null,
      )
    }

    /**
     * 当前界面语言是不是英文。
     *
     * 为什么不走 `ctx.locale.register` + `bind`：那份词典按 locale id 分桶，
     * 桶里缺键时回落的是英文桶（不是"返回原串"），于是中文界面会整页变英文
     * —— 实测就是这样翻车的。这里只把 locale 服务当"读当前语言"来用，
     * 中文/取不到时直接返回原串（中文原串就是文案），英文时才查词典。
     * @returns {boolean}
     */
    function isEnglish(ctx) {
      try {
        const snapshot = ctx.locale && typeof ctx.locale.getLocale === 'function' ? ctx.locale.getLocale() : null
        const id = snapshot && typeof snapshot.id === 'string' ? snapshot.id : ''
        return /^en/i.test(id)
      } catch (error) {
        return false
      }
    }

    /**
     * @param {boolean} english 是否英文界面。
     * @returns {(key: string) => string} 取文案。
     */
    function makeTranslator(english) {
      return function t(key) {
        if (!english) return key
        return Object.prototype.hasOwnProperty.call(en, key) ? en[key] : key
      }
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const t = makeTranslator(isEnglish(ctx))
        ctx.slots.inject('settings.section', () =>
          ctx.slots.register(
            {
              name: 'settings.section',
              id: 'visual-deck',
              order: 42,
              label: () => t('启动动画与背景'),
            },
            () => h(Panel, { t }),
          ),
        )
      },
    }
  },
})
