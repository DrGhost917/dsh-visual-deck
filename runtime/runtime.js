/*
 * dsh-visual-deck —— 注入到首页的运行时（随 kind:'script' 行落进 <body>）。
 *
 * 三件事，全是"页面级"的，不碰 React：
 *   ① 读一次 /visual-deck/api/state；
 *   ② 有启动动画就放一遍（点击/按键/放完/超时都会收场，最多 10 秒）；
 *   ③ 有会话背景就铺一层固定层，并把界面表面变半透明。
 *
 * 兜底原则：任何一步失败都只是"少一个装饰"，并且**必须把半透明关掉** ——
 * 否则界面会变成半透明却没有壁纸托底，字直接糊在画布色上。
 */
;(function () {
  'use strict'

  if (typeof window === 'undefined') return
  if (window.__DSH_VISUAL_DECK__ && window.__DSH_VISUAL_DECK__.__installed === true) return

  var BOOT_MAX_MS = 10000
  var BOOT_START_TIMEOUT_MS = 2500
  var FADE_MS = 500
  var STATE_PATH = '/visual-deck/api/state'

  var reduceMotion = false
  try {
    reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches === true
  } catch (error) {
    reduceMotion = false
  }

  /**
   * 一律用相对地址。
   *
   * 这是踩过的坑：桌面壳的页面可能挂在自定义协议（`dsh-app://`）下，那里的相对路径
   * 会被壳代理到宿主的 HTTP 服务；改成 `http://127.0.0.1:端口/...` 的绝对地址反而
   * 变成跨域，被浏览器拦掉 —— 表现就是"设置页能读出素材（相对地址），背景层却一片空白"。
   * @param {string} pathname 路径。
   * @returns {string} 原样返回。
   */
  function url(pathname) {
    return pathname
  }

  function mediaUrl(id) {
    return url('/visual-deck/media?id=' + encodeURIComponent(String(id)))
  }

  /** body 还不存在时等它（脚本也可能被放进 head）。 */
  function whenBody(fn) {
    if (document.body) {
      fn()
      return
    }
    document.addEventListener('DOMContentLoaded', function () {
      if (document.body) fn()
    }, { once: true })
  }

  function buildMedia(item, className) {
    var el
    if (item.kind === 'video') {
      el = document.createElement('video')
      el.muted = true
      el.loop = true
      el.autoplay = true
      el.playsInline = true
      el.setAttribute('muted', '')
      el.setAttribute('playsinline', '')
      el.setAttribute('webkit-playsinline', '')
      el.preload = 'auto'
      el.dataset.kind = 'video'
    } else {
      el = document.createElement('img')
      el.decoding = 'async'
      el.alt = ''
      el.dataset.kind = 'image'
    }
    el.className = className
    el.addEventListener('load', function () {
      el.dataset.shown = '1'
    })
    el.addEventListener('loadeddata', function () {
      el.dataset.shown = '1'
    })
    el.addEventListener('canplay', function () {
      el.dataset.shown = '1'
    })
    // 解码失败：把这个装饰撤掉，让界面回到不透明的原生外观。
    el.addEventListener('error', function () {
      el.dataset.shown = '0'
      el.dispatchEvent(new CustomEvent('vd-media-error', { bubbles: true }))
    })
    el.src = mediaUrl(item.id)
    return el
  }

  /* ───────────────────────── 会话背景 ───────────────────────── */

  /** 每次铺/撤背景都 +1：旧的兜底定时器不能把新背景的标记一起撤掉。 */
  var generation = 0

  /**
   * 铺背景；传 null 表示撤掉（并且必须把半透明关掉）。
   * @param {null | {id: string, kind: string}} item 背景素材。
   */
  function setBackground(item) {
    generation += 1
    var mine = generation
    var existing = document.getElementById('vd-backdrop')
    if (!item) {
      if (existing) existing.parentNode.removeChild(existing)
      document.documentElement.removeAttribute('data-vd')
      return
    }

    if (existing) existing.parentNode.removeChild(existing)

    var layer = document.createElement('div')
    layer.id = 'vd-backdrop'
    var media = buildMedia(item, 'vd-backdrop-media')
    var veil = document.createElement('div')
    veil.id = 'vd-backdrop-veil'
    layer.appendChild(media)
    layer.appendChild(veil)

    function giveUp() {
      if (mine !== generation) return
      if (layer.parentNode) layer.parentNode.removeChild(layer)
      document.documentElement.removeAttribute('data-vd')
    }

    media.addEventListener('vd-media-error', giveUp)
    // 只有视频需要"8 秒没画面就撤"：图片解码失败会自己 error，
    // 而这张兜底定时器误伤过（层留下了、图还没画出来，界面就成了"黑底半透明"）。
    if (item.kind === 'video') {
      setTimeout(function () {
        if (media.dataset.shown === '1') return
        giveUp()
      }, 8000)
    }

    document.body.appendChild(layer)
    document.documentElement.setAttribute('data-vd', 'on')

    if (item.kind === 'video') {
      var playing = media.play()
      if (playing && typeof playing.catch === 'function') playing.catch(function () {})
    }
  }

  /* ───────────────────────── 启动动画 ───────────────────────── */

  /**
   * 铺一层覆盖层。onGiveUp：拿不到可用素材时立刻撤掉（避免盖住界面）。
   * @returns {{el: HTMLElement, setItem: (item: any) => void, dismiss: (reason?: string) => void}}
   */
  function mountBoot() {
    var el = document.createElement('div')
    el.id = 'vd-boot'
    el.dataset.state = 'loading'
    el.setAttribute('role', 'presentation')

    var veil = document.createElement('div')
    veil.className = 'vd-boot-veil'

    var ui = document.createElement('div')
    ui.className = 'vd-boot-ui'
    var bar = document.createElement('div')
    bar.className = 'vd-boot-bar'
    var fill = document.createElement('div')
    fill.className = 'vd-boot-fill'
    bar.appendChild(fill)
    var hint = document.createElement('div')
    hint.className = 'vd-boot-hint'
    hint.textContent = '正在启动…'
    ui.appendChild(bar)
    ui.appendChild(hint)

    var skip = document.createElement('div')
    skip.className = 'vd-boot-skip'
    skip.textContent = '点击画面跳过'

    el.appendChild(veil)
    el.appendChild(ui)
    el.appendChild(skip)
    document.body.appendChild(el)

    var finished = false
    var timers = []

    function clearTimers() {
      for (var i = 0; i < timers.length; i += 1) clearTimeout(timers[i])
      timers = []
    }

    function dismiss(immediate) {
      if (finished) return
      finished = true
      clearTimers()
      document.removeEventListener('keydown', onKey, true)
      var media = el.querySelector('video')
      if (media) {
        try {
          media.pause()
        } catch (error) {
          /* ignore */
        }
      }
      if (immediate === true) {
        if (el.parentNode) el.parentNode.removeChild(el)
        return
      }
      el.dataset.state = 'leaving'
      setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el)
      }, FADE_MS)
    }

    function onKey(event) {
      if (event.key === 'Escape' || event.key === ' ' || event.key === 'Enter') {
        event.preventDefault()
        dismiss()
      }
    }

    el.addEventListener('click', dismiss)
    document.addEventListener('keydown', onKey, true)

    var started = false

    /**
     * 放一遍启动动画。
     * @param {any} item 素材（必须是视频）。
     * @param {number} [volume] 音量 0..1，缺省 1。
     */
    function setItem(item, volume) {
      if (finished) return
      if (!item || item.kind !== 'video') {
        // 纠错第三道闸：不是视频就当作没有启动动画。
        dismiss(true)
        return
      }
      var vol = typeof volume === 'number' && isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 1
      var media = buildMedia(item, 'vd-boot-media')
      media.loop = false
      media.autoplay = false
      // 启动动画**带声音**：Electron 的自动播放策略是 no-user-gesture-required，
      // 这里通常能直接出声；被拦时下面会退回静音重播，不扣住用户。
      media.muted = vol <= 0
      media.defaultMuted = vol <= 0
      if (vol <= 0) media.setAttribute('muted', '')
      else media.removeAttribute('muted')
      media.volume = vol
      el.insertBefore(media, el.firstChild)

      media.addEventListener('playing', function () {
        started = true
        el.dataset.state = 'playing'
        media.dataset.shown = '1'
      })
      media.addEventListener('ended', dismiss)
      media.addEventListener('error', dismiss)
      media.addEventListener('vd-media-error', dismiss)

      var playing = media.play()
      if (playing && typeof playing.catch === 'function') {
        playing.catch(function () {
          // 带声音被拦（普通浏览器常见）：静音重来一次，静音也放不出来才收场。
          try {
            media.muted = true
            media.setAttribute('muted', '')
          } catch (error) {
            /* ignore */
          }
          var again = media.play()
          if (again && typeof again.catch === 'function') {
            again.catch(function () {
              timers.push(setTimeout(dismiss, 600))
            })
          }
        })
      }
      // 迟迟没有第一帧：收场。
      timers.push(
        setTimeout(function () {
          if (!started) dismiss()
        }, BOOT_START_TIMEOUT_MS),
      )
      timers.push(setTimeout(dismiss, BOOT_MAX_MS))
    }

    return { el: el, setItem: setItem, dismiss: dismiss }
  }

  /**
   * 模态弹层打开时给 `<html>` 打 `data-vd-modal`，让 CSS 把界面表面拉回接近不透明。
   *
   * 为什么不能只用 CSS `:has([role="dialog"])`：隐藏起来但一直挂在 DOM 里的弹层也会
   * 命中，结果就是壁纸永远透不过来。这里只认"真看得见"的（有尺寸、没 hidden），
   * 并用 MutationObserver 跟着 DOM 变化同步。
   */
  function watchModals() {
    var SELECTOR = '[role="dialog"],[aria-modal="true"]'
    var last = null
    var timer = 0

    function visibleDialog() {
      var list
      try {
        list = document.querySelectorAll(SELECTOR)
      } catch (error) {
        return false
      }
      for (var i = 0; i < list.length; i += 1) {
        var el = list[i]
        if (!el || el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') continue
        var rect = el.getBoundingClientRect()
        if (rect.width > 40 && rect.height > 40) return true
      }
      return false
    }

    function sync() {
      var open = visibleDialog()
      if (open === last) return
      last = open
      try {
        if (open) document.documentElement.setAttribute('data-vd-modal', '1')
        else document.documentElement.removeAttribute('data-vd-modal')
      } catch (error) {
        /* ignore */
      }
    }

    function schedule() {
      if (timer) return
      timer = setTimeout(function () {
        timer = 0
        sync()
      }, 120)
    }

    sync()
    try {
      if (typeof MutationObserver === 'function' && document.body) {
        var observer = new MutationObserver(schedule)
        observer.observe(document.body, { childList: true, subtree: true })
      }
    } catch (error) {
      /* 观察不了就跑一次初值 */
    }
    window.addEventListener('resize', schedule)
    window.addEventListener('focus', schedule)
  }

  /* ───────────────────────── 状态 ───────────────────────── */

  var boot = null
  /** 最近一次读到的状态（预览要用它找素材）。 */
  var lastState = null
  /** 用户临时关掉壁纸（只影响这一页，不写盘）。 */
  var paused = false
  /** 开场动画这次是否已经打过卡（同一页只打一次）。 */
  var bootMarked = false

  function byId(state, id) {
    if (!state || !Array.isArray(state.items) || typeof id !== 'string') return null
    for (var i = 0; i < state.items.length; i += 1) {
      if (state.items[i] && state.items[i].id === id) return state.items[i]
    }
    return null
  }

  /** 页面上现在到底什么样（只读）。 */
  function snapshot(phase) {
    var layer = document.getElementById('vd-backdrop')
    var media = layer ? layer.querySelector('img, video') : null
    var out = {
      phase: phase,
      at: new Date().toISOString(),
      href: String(location.href),
      installed: true,
      attr: document.documentElement.getAttribute('data-vd'),
      layer: layer !== null,
      layerZ: layer ? getComputedStyle(layer).zIndex : '',
      tag: media ? media.tagName.toLowerCase() : '',
      shown: media ? media.dataset.shown || '0' : '',
      src: media && media.currentSrc ? media.currentSrc.slice(-90) : media && media.src ? String(media.src).slice(-90) : '',
      bodyBg: document.body ? getComputedStyle(document.body).backgroundColor : '',
      htmlBg: getComputedStyle(document.documentElement).backgroundColor,
      reduceMotion: reduceMotion,
      paused: paused,
      bodyChildren: document.body ? document.body.children.length : 0,
    }
    return out
  }

  /** 把一次取证发给宿主（落成 client-report.json），失败完全无害。 */
  function report(payload) {
    try {
      fetch('/visual-deck/api/client-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        cache: 'no-store',
        credentials: 'same-origin',
      }).catch(function () {})
    } catch (error) {
      /* 取证失败不该影响任何东西 */
    }
  }

  function apply(state) {
    var settings = (state && state.settings) || {}
    var background = byId(state, settings.backgroundId)
    applyStrength(settings.backgroundStrength)
    applyBlur(settings.backgroundBlur)
    try {
      if (paused) {
        // 用户临时关掉了壁纸：把层和半透明一起撤掉，界面回原生。
        setBackground(null)
      } else if (reduceMotion && background && background.kind === 'video') {
        // reduced-motion：视频背景不播，只留半透明界面。
        setBackground(null)
      } else {
        setBackground(background)
      }
    } catch (error) {
      setBackground(null)
      report(snapshot('apply-failed:' + String(error && error.message ? error.message : error)))
    }

    if (boot) {
      var item = byId(state, settings.bootId)
      if (item && item.kind === 'video' && !reduceMotion && shouldPlayBoot(settings)) {
        boot.setItem(item, settings.bootVolume)
        markBootShown()
      } else {
        boot.dismiss(true)
      }
    }
  }

  /**
   * 这次该不该放开场动画（"每天一次 / 仅首次"靠宿主记的时间判断）。
   * 判断不了一律放 —— 宁可多放一次，也别让人以为插件坏了。
   * @param {any} settings 设置。
   * @returns {boolean} 是否播放。
   */
  function shouldPlayBoot(settings) {
    var mode = settings && settings.bootWhen
    if (mode !== 'daily' && mode !== 'once') return true
    var at = settings && typeof settings.bootShownAt === 'number' ? settings.bootShownAt : 0
    if (!at) return true
    if (mode === 'once') return false
    var last = new Date(at)
    var now = new Date()
    return (
      last.getFullYear() !== now.getFullYear() ||
      last.getMonth() !== now.getMonth() ||
      last.getDate() !== now.getDate()
    )
  }

  /** 开场播完之后给宿主打一次卡（只在内存里标记，避免同一页重复打）。 */
  function markBootShown() {
    if (bootMarked) return
    bootMarked = true
    var at = Date.now()
    if (lastState && lastState.settings) lastState.settings.bootShownAt = at
    try {
      fetch('/visual-deck/api/boot-shown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        credentials: 'same-origin',
        body: JSON.stringify({ at: at }),
      }).catch(function () {})
    } catch (error) {
      /* 打卡失败只是"下次可能多放一遍" */
    }
  }

  /**
   * 临时开关壁纸（不写盘、只作用于这一页）。
   * @param {boolean} next 是否暂停。
   * @returns {boolean} 现在的暂停状态。
   */
  function setPaused(next) {
    paused = next === true
    try {
      document.documentElement.setAttribute('data-vd-paused', paused ? '1' : '0')
    } catch (error) {
      /* ignore */
    }
    if (paused) setBackground(null)
    else if (lastState) apply(lastState)
    return paused
  }

  /**
   * 背景模糊（px）→ CSS 变量。
   * @param {unknown} value 0..12。
   * @returns {number} 实际采用的值。
   */
  function applyBlur(value) {
    var px = typeof value === 'number' && isFinite(value) ? Math.min(12, Math.max(0, value)) : 0
    var root = document.documentElement
    if (!root || !root.style || typeof root.style.setProperty !== 'function') return px
    root.style.setProperty('--vd-blur', (Math.round(px * 10) / 10) + 'px')
    return px
  }

  /**
   * 背景强度 → 界面表面 alpha。
   *
   * 0 = 界面接近原生（面板很实，壁纸基本看不见）；1 = 面板最透、壁纸最清楚。
   * 亮色主题同强度下更实一些：文字是深色，白面一薄对比度立刻掉。
   * 算好再写成独立变量（不在 rgba() 里塞 calc()），值是确定的、也能被断言。
   * @param {unknown} value 0..1。
   * @returns {number} 实际采用的值。
   */
  function applyStrength(value) {
    var s = typeof value === 'number' && isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.75
    var root = document.documentElement
    if (!root || !root.style || typeof root.style.setProperty !== 'function') return s
    var round = function (n) {
      return String(Math.round(n * 1000) / 1000)
    }
    var configs = [
      ['', 0.55 - 0.5 * s],
      ['-light', 0.95 - 0.46 * s],
    ]
    for (var i = 0; i < configs.length; i += 1) {
      var suffix = configs[i][0]
      var base = configs[i][1]
      root.style.setProperty('--vd-surface' + suffix, round(base))
      root.style.setProperty('--vd-layer1' + suffix, round(Math.min(1, base + 0.1)))
      root.style.setProperty('--vd-layer2' + suffix, round(Math.min(1, base + 0.16)))
      root.style.setProperty('--vd-layer3' + suffix, round(Math.min(1, base + 0.2)))
      root.style.setProperty('--vd-sidebar' + suffix, round(Math.min(1, base + 0.06)))
    }
    root.style.setProperty('--vd-veil', round(0.3 - 0.16 * s))
    root.style.setProperty('--vd-veil-light', round(0.22 - 0.12 * s))
    return s
  }

  /**
   * 读状态并应用；设置页改完会直接调它，所以不需要刷新页面。
   *
   * 失败会重试两次（间隔 900ms）：页面刚起来时宿主的接口偶尔还没就绪，
   * 一次失败就放弃会让背景一直空着，直到用户手动再点一次。
   * @param {number} [attempt] 第几次尝试（内部用）。
   * @returns {Promise<any>} 状态（最终失败时 undefined）。
   */
  function reload(attempt) {
    var tries = typeof attempt === 'number' ? attempt : 0
    return fetch(url(STATE_PATH), { cache: 'no-store', credentials: 'same-origin' })
      .then(function (response) {
        if (!response.ok) throw new Error('state ' + response.status)
        return response.json()
      })
      .then(function (state) {
        lastState = state
        apply(state)
        var bg = state && state.settings ? state.settings.backgroundId : null
        var payload = snapshot('applied')
        payload.bgId = bg || null
        payload.items = Array.isArray(state && state.items) ? state.items.length : -1
        report(payload)
        return state
      })
      .catch(function (error) {
        if (tries < 2) {
          return new Promise(function (resolve) {
            setTimeout(resolve, 900)
          }).then(function () {
            return reload(tries + 1)
          })
        }
        report(snapshot('state-failed:' + String(error && error.message ? error.message : error)))
        // 读不到就当作"没配"，并把半透明关掉。
        try {
          if (boot) boot.dismiss(true)
          setBackground(null)
        } catch (ignored) {
          /* ignore */
        }
        return undefined
      })
  }

  /**
   * 预览启动动画：用同一套覆盖层放一遍，点击/放完/超时都会收场。
   *
   * 和"开机自动播"唯一的区别是：这条由用户主动触发，所以**不受 reduced-motion 限制**
   * （用户点的，就该看到）。声音沿用已保存的音量。
   * @param {string} [id] 要预览的素材 id，缺省用当前设置的启动动画。
   * @returns {boolean} 是否真的开始播了。
   */
  function preview(id) {
    var state = lastState
    var wanted = typeof id === 'string' && id !== '' ? id : state && state.settings ? state.settings.bootId : null
    var item = byId(state, wanted)
    if (!item || item.kind !== 'video') return false
    var volume = state && state.settings && typeof state.settings.bootVolume === 'number' ? state.settings.bootVolume : 1
    try {
      // 连点预览时先收掉上一条，别让两层覆盖层叠着放。
      var stale = document.getElementById('vd-boot')
      if (stale && stale.parentNode) stale.parentNode.removeChild(stale)
      var overlay = mountBoot()
      overlay.setItem(item, volume)
      return true
    } catch (error) {
      report(snapshot('preview-failed:' + String(error && error.message ? error.message : error)))
      return false
    }
  }

  window.__DSH_VISUAL_DECK__ = {
    __installed: true,
    reload: function () {
      return reload(0)
    },
    preview: preview,
    setStrength: applyStrength,
    setBlur: applyBlur,
    setPaused: setPaused,
  }

  whenBody(function () {
    try {
      report(snapshot('begin'))
      // 先把覆盖层挂上（此刻还没拿到素材，但页面已经在加载了）：拿到状态再决定留不留。
      if (!reduceMotion) {
        try {
          boot = mountBoot()
        } catch (error) {
          report(snapshot('boot-failed:' + String(error && error.message ? error.message : error)))
        }
      }
      reload()
      // 设置页改完会发这个事件；同时兜住"运行时比设置页晚加载"的场景。
      window.addEventListener('vd:changed', function () {
        reload()
      })
      watchModals()
      // 再补一份延迟取证：有些问题要等界面挂完才看得出来。
      setTimeout(function () {
        report(snapshot('after-1200ms'))
      }, 1200)
    } catch (error) {
      report(snapshot('begin-failed:' + String(error && error.message ? error.message : error)))
    }
  })
})()
