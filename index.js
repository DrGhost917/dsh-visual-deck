/**
 * dsh-visual-deck —— 启动动画与会话背景管理器（宿主半边）。
 *
 * 职责：
 *   ① 素材库：把用户导入的图片/视频存到 <DSH_HOME>/visual-deck/，维护一份清单；
 *   ② HTTP 接口：素材列表 / 上传 / 设为启动动画 / 设为会话背景 / 删除 / 媒体流；
 *   ③ 索引注入：往页面里推一行样式 + 一段运行时脚本，由它在应用挂载前挂上
 *      「开机动画覆盖层」和「聊天背景层」。
 *
 * 三条硬约束（都是 dsh-video-skin 踩过的坑，这里照抄结论）：
 *   - `inject` 必须是空数组、`apply` 必须同步跑完注册：桌面壳的注入表在宿主启动时
 *     收集一次，订阅晚一步就永远进不了表。
 *   - 注入行只推 `kind:'script'`（绝不推 `script-src`）：后者加载失败会连带把
 *     `__DSH_BOOT_READY__` 打掉，应用起不来。
 *   - 任何一步失败都只降级（没有素材、没有背景），绝不让页面渲染失败。
 *
 * 「启动动画只能放视频」这件纠错在**三个地方**各做一次：
 *   前端按钮置灰 → 宿主 POST 校验拒绝非视频 → 运行时再判一次 kind。
 * 任何一层被绕过，结果仍然是一个不播动画、不报错的界面。
 *
 * @module dsh-visual-deck
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

/** Cordis 诊断用的插件名。 */
export const name = 'visual-deck'

/** 没有必需服务：`webServer` 用 `ctx.inject` 迟到接入，不阻塞 apply。 */
export const inject = []

/** 接口前缀。 */
export const ROUTE_PREFIX = '/visual-deck'
/** 素材列表 + 当前设置。 */
export const STATE_ROUTE = `${ROUTE_PREFIX}/api/state`
/** 原始字节上传（POST）。 */
export const UPLOAD_ROUTE = `${ROUTE_PREFIX}/api/upload`
/** 切启动动画 / 切背景（POST JSON）。 */
export const SETTINGS_ROUTE = `${ROUTE_PREFIX}/api/settings`
/** 删除一条素材（DELETE）。 */
export const ITEM_ROUTE = `${ROUTE_PREFIX}/api/item`
/** 媒体流（支持 Range）。 */
export const MEDIA_ROUTE = `${ROUTE_PREFIX}/media`
/** 设置页的界面诊断回执（只写一个 JSON 文件，方便排查"背景看不到"）。 */
export const REPORT_ROUTE = `${ROUTE_PREFIX}/api/client-report`
/** 运行时上报"这次开机动画已经放过了"（给"每天一次 / 仅首次"用）。 */
export const BOOT_SHOWN_ROUTE = `${ROUTE_PREFIX}/api/boot-shown`

/** 单文件上限：200 MB。 */
export const MAX_BYTES = 200 * 1024 * 1024
/** 设置请求体的上限（只收几个 id）。 */
const SETTINGS_BODY_LIMIT = 16 * 1024

/** 视频扩展名 → MIME。 */
const VIDEO_EXT = new Map([
  ['.mp4', 'video/mp4'],
  ['.m4v', 'video/mp4'],
  ['.webm', 'video/webm'],
  ['.mov', 'video/quicktime'],
  ['.ogv', 'video/ogg'],
])

/** 图片扩展名 → MIME。 */
const IMAGE_EXT = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
  ['.avif', 'image/avif'],
])

/** 运行时文本文件目录（相对包根）。 */
const RUNTIME_DIR = 'runtime'

/**
 * 一个安全的一行错误描述。
 * @param {unknown} error 任意抛出的值。
 * @returns {string} 文本。
 */
function describe(error) {
  return error instanceof Error ? error.message : String(error)
}

/**
 * DSH_HOME：宿主进程通常带着 `DSH_HOME`，没有时退回 `~/.dsh`。
 * @returns {string} 绝对路径。
 */
function resolveDshHome() {
  const fromEnv = process.env.DSH_HOME
  if (typeof fromEnv === 'string' && fromEnv !== '') return path.resolve(fromEnv)
  return path.join(os.homedir(), '.dsh')
}

/**
 * 插件自己的数据目录（与 DSH 的 storages 分开，避免和存储服务抢目录）。
 * @returns {string} 绝对路径。
 */
function dataDir() {
  return path.join(resolveDshHome(), 'visual-deck')
}

/**
 * 素材文件目录。
 * @returns {string} 绝对路径。
 */
function mediaDir() {
  return path.join(dataDir(), 'media')
}

/**
 * 清单文件。
 * @returns {string} 绝对路径。
 */
function storeFile() {
  return path.join(dataDir(), 'deck.json')
}

/** 启动动画的默认音量（0..1）。 */
const DEFAULT_BOOT_VOLUME = 1
/** 背景强度默认值（0=界面接近原生，1=壁纸最清楚）。 */
const DEFAULT_BACKGROUND_STRENGTH = 0.75
/** 背景模糊上限（px）。 */
const MAX_BACKGROUND_BLUR = 12
/** 启动动画的播放时机（白名单）。 */
const BOOT_WHEN_VALUES = ['always', 'daily', 'once']
const DEFAULT_BOOT_WHEN = 'always'

/** 空清单。 */
function emptyDeck() {
  return {
    version: 1,
    items: [],
    settings: {
      backgroundId: null,
      bootId: null,
      bootVolume: DEFAULT_BOOT_VOLUME,
      backgroundStrength: DEFAULT_BACKGROUND_STRENGTH,
      backgroundBlur: 0,
      bootWhen: DEFAULT_BOOT_WHEN,
      bootShownAt: null,
    },
  }
}

/**
 * 把任意脏值夹成 0..1 的数，保留两位小数。
 * @param {unknown} value 候选值。
 * @param {number} fallback 不是有限数时用的默认值。
 * @returns {number} 合法值。
 */
function clampUnit(value, fallback) {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.round(Math.min(1, Math.max(0, n)) * 100) / 100
}

/**
 * 把任意脏值夹进 [min, max]，保留一位小数。
 * @param {unknown} value 候选值。
 * @param {number} fallback 不是有限数时用的默认值。
 * @param {number} min 下界。
 * @param {number} max 上界。
 * @returns {number} 合法值。
 */
function clampRange(value, fallback, min, max) {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.round(Math.min(max, Math.max(min, n)) * 10) / 10
}

/**
 * 读清单。坏文件/缺字段都退回空清单，并把结构夹到当前版本 —— 旧数据不该让插件起不来。
 * @returns {{version: number, items: Array<Record<string, any>>, settings: {backgroundId: string|null, bootId: string|null}}}
 */
function readDeck() {
  const base = emptyDeck()
  let raw
  try {
    raw = JSON.parse(fs.readFileSync(storeFile(), 'utf8'))
  } catch {
    return base
  }
  if (typeof raw !== 'object' || raw === null) return base
  const items = Array.isArray(raw.items)
    ? raw.items.filter((item) => {
        return (
          item &&
          typeof item.id === 'string' &&
          typeof item.file === 'string' &&
          (item.kind === 'video' || item.kind === 'image') &&
          typeof item.name === 'string'
        )
      })
    : []
  const settings = raw.settings && typeof raw.settings === 'object' ? raw.settings : {}
  return {
    version: 1,
    items,
    settings: {
      backgroundId: typeof settings.backgroundId === 'string' ? settings.backgroundId : null,
      bootId: typeof settings.bootId === 'string' ? settings.bootId : null,
      bootVolume: clampUnit(settings.bootVolume, DEFAULT_BOOT_VOLUME),
      backgroundStrength: clampUnit(settings.backgroundStrength, DEFAULT_BACKGROUND_STRENGTH),
      backgroundBlur: clampRange(settings.backgroundBlur, 0, 0, MAX_BACKGROUND_BLUR),
      bootWhen: BOOT_WHEN_VALUES.indexOf(settings.bootWhen) >= 0 ? settings.bootWhen : DEFAULT_BOOT_WHEN,
      bootShownAt:
        typeof settings.bootShownAt === 'number' && Number.isFinite(settings.bootShownAt)
          ? settings.bootShownAt
          : null,
    },
  }
}

/**
 * 原子写清单（临时文件 + rename），写坏的最坏结果是旧清单。
 * @param {ReturnType<typeof emptyDeck>} deck 清单。
 */
function writeDeck(deck) {
  fs.mkdirSync(dataDir(), { recursive: true })
  const target = storeFile()
  const tmp = `${target}.${process.pid}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(deck, null, 2)}\n`, 'utf8')
  fs.renameSync(tmp, target)
}

/**
 * 往浏览器发一份 JSON。
 * @param {import('node:http').ServerResponse} res 响应对象。
 * @param {number} status 状态码。
 * @param {unknown} payload 可序列化载荷。
 */
function replyJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  })
  res.end(body)
}

/**
 * 读一个小 JSON 请求体（带上限）。
 * @param {import('node:http').IncomingMessage} req 入站请求。
 * @param {number} limit 字节上限。
 * @returns {Promise<unknown>} 解析结果。
 */
function readJsonBody(req, limit = SETTINGS_BODY_LIMIT) {
  return new Promise((resolve, reject) => {
    /** @type {Buffer[]} */
    const chunks = []
    let size = 0
    let settled = false
    req.on('data', (chunk) => {
      if (settled) return
      size += chunk.length
      if (size > limit) {
        settled = true
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('error', (error) => {
      if (settled) return
      settled = true
      reject(error)
    })
    req.on('end', () => {
      if (settled) return
      settled = true
      try {
        const text = Buffer.concat(chunks).toString('utf8')
        resolve(text === '' ? {} : JSON.parse(text))
      } catch (error) {
        reject(new Error(`invalid JSON: ${describe(error)}`))
      }
    })
  })
}

/**
 * 解析 HTTP `Range` 头（Chromium 的 `<video>` 会先发 `bytes=0-`）。
 * @param {string | undefined} header Range 头原文。
 * @param {number} size 资源总字节数。
 * @returns {{start: number, end: number} | 'unsatisfiable' | null} 闭区间 / 416 / 整份。
 */
function parseRange(header, size) {
  if (typeof header !== 'string' || header === '') return null
  const match = /^bytes=(\d*)-(\d*)$/u.exec(header.trim())
  if (match === null) return null
  const rawStart = match[1] ?? ''
  const rawEnd = match[2] ?? ''
  if (rawStart === '' && rawEnd === '') return null
  let start
  let end
  if (rawStart === '') {
    const suffix = Number(rawEnd)
    if (!Number.isFinite(suffix) || suffix <= 0) return 'unsatisfiable'
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = Number(rawStart)
    end = rawEnd === '' ? size - 1 : Number(rawEnd)
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  if (size <= 0) return 'unsatisfiable'
  if (start > end || start >= size) return 'unsatisfiable'
  return { start, end: Math.min(end, size - 1) }
}

/**
 * 按扩展名给出 MIME；未知类型回落 octet-stream。
 * @param {string} file 文件名。
 * @returns {string} MIME。
 */
function contentTypeFor(file) {
  const ext = path.extname(String(file)).toLowerCase()
  return VIDEO_EXT.get(ext) ?? IMAGE_EXT.get(ext) ?? 'application/octet-stream'
}

/**
 * 把一个媒体文件按 HTTP 语义发给浏览器：ETag + Range + HEAD。
 *
 * 整片响应用 `no-cache`（回源校验，素材没换就是 304）；
 * 切片响应用 `no-store`（否则浏览器可能把半截 206 当成完整资源缓存，
 * 下次刷新就是"黑屏没画面"）。
 * @param {import('node:http').IncomingMessage} req 入站请求。
 * @param {import('node:http').ServerResponse} res 响应对象。
 * @param {string} filePath 绝对路径。
 */
function serveMedia(req, res, filePath) {
  let stat
  try {
    stat = fs.statSync(filePath)
  } catch {
    replyJson(res, 404, { ok: false, error: 'file-missing' })
    return
  }
  const size = stat.size
  const etag = `"${size.toString(16)}-${Math.round(stat.mtimeMs).toString(16)}"`
  const range = parseRange(req.headers.range, size)

  if (range === 'unsatisfiable') {
    res.writeHead(416, { 'Content-Range': `bytes */${size}`, 'Accept-Ranges': 'bytes' })
    res.end()
    return
  }

  /** @type {Record<string, string | number>} */
  const headers = {
    'Content-Type': contentTypeFor(filePath),
    'Accept-Ranges': 'bytes',
    ETag: etag,
  }

  if (range !== null) {
    headers['Cache-Control'] = 'no-store'
    headers['Content-Length'] = range.end - range.start + 1
    headers['Content-Range'] = `bytes ${range.start}-${range.end}/${size}`
    res.writeHead(206, headers)
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    const stream = fs.createReadStream(filePath, { start: range.start, end: range.end })
    stream.on('error', () => res.destroy())
    stream.pipe(res)
    return
  }

  headers['Cache-Control'] = 'no-cache'
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers)
    res.end()
    return
  }
  headers['Content-Length'] = size
  res.writeHead(200, headers)
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  const stream = fs.createReadStream(filePath)
  stream.on('error', () => res.destroy())
  stream.pipe(res)
}

/**
 * 造一个按 mtime+size 缓存的运行时文件读取器。
 * @param {string} packageRoot 包根目录。
 * @returns {(file: string) => string} 读取器。
 */
function makeRuntimeReader(packageRoot) {
  /** @type {Map<string, {mtimeMs: number, size: number, text: string}>} */
  const cache = new Map()
  return (file) => {
    const target = path.join(packageRoot, RUNTIME_DIR, file)
    const stat = fs.statSync(target)
    const hit = cache.get(file)
    if (hit !== undefined && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) return hit.text
    const text = fs.readFileSync(target, 'utf8')
    cache.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, text })
    return text
  }
}

/**
 * 把一个字符串安全地嵌进内联 `<script>` 文本里的 JSON 字面量。
 * @param {unknown} value 可序列化的值。
 * @returns {string} 表达式文本。
 */
function toInlineJson(value) {
  return JSON.stringify(value)
    .replace(/</gu, '\\u003c')
    .replace(/\u2028/gu, '\\u2028')
    .replace(/\u2029/gu, '\\u2029')
}

/**
 * 插件主体。
 * @param {import('@deepseek-ai/cordis').Context} ctx 插件上下文。
 */
export function apply(ctx) {
  const packageRoot = fileURLToPath(new URL('.', import.meta.url))
  const readRuntime = makeRuntimeReader(packageRoot)

  const warn = (message) => {
    try {
      ctx.logger?.warn?.(`[${name}] ${message}`)
    } catch {
      /* 日志不该成为失败原因 */
    }
  }
  const info = (message) => {
    try {
      ctx.logger?.info?.(`[${name}] ${message}`)
    } catch {
      /* 同上 */
    }
  }

  try {
    fs.mkdirSync(mediaDir(), { recursive: true })
    if (!fs.existsSync(storeFile())) writeDeck(emptyDeck())
  } catch (error) {
    warn(`数据目录不可用（${dataDir()}）：${describe(error)}`)
  }

  /** 当前清单 + 对外快照。`dataDir` 给设置页显示配置文件真实路径用。 */
  const snapshot = () => {
    const deck = readDeck()
    return { ...deck, dataDir: dataDir(), limits: { maxBytes: MAX_BYTES } }
  }

  // ── ① 索引注入：样式 + 运行时脚本。必须同步注册，不能等服务就绪。 ──
  ctx.on('webserver/index-inject', (table) => {
    if (!Array.isArray(table)) return
    try {
      let origin = ''
      try {
        origin = ctx.get('webServer')?.getOrigin?.() ?? ''
      } catch {
        origin = ''
      }
      const cssText = readRuntime('runtime.css')
      const jsText = readRuntime('runtime.js')
      const bootstrap = `globalThis.__VD_BASE__=${toInlineJson(origin)};`
      table.push({ kind: 'style', text: cssText })
      table.push({ kind: 'script', placement: 'body', text: `${bootstrap}\n${jsText}` })
    } catch (error) {
      // 注入失败只是"没有动画/没有背景"，绝不能让首页渲染失败。
      warn(`注入行生成失败，界面回落到原生外观：${describe(error)}`)
    }
  })

  // ── ② 接口：webServer 是可选项，晚到就晚接。 ──
  ctx.inject(['webServer'], (child) => {
    child.effect(() => {
      /** @type {Array<() => void>} */
      const disposers = []

      const ensureItem = (id) => {
        if (typeof id !== 'string' || id === '') return undefined
        return readDeck().items.find((item) => item.id === id)
      }

      // 列表 + 设置
      disposers.push(
        child.webServer.register({
          kind: 'exact',
          path: STATE_ROUTE,
          handler: (req, res) => {
            if ((req.method ?? 'GET') !== 'GET' && req.method !== 'HEAD') {
              replyJson(res, 405, { ok: false, error: 'method-not-allowed' })
              return
            }
            try {
              replyJson(res, 200, { ok: true, ...snapshot() })
            } catch (error) {
              replyJson(res, 500, { ok: false, error: describe(error) })
            }
          },
        }),
      )

      // 上传：?name=<原始文件名>&kind=video|image，正文是原始字节
      disposers.push(
        child.webServer.register({
          kind: 'exact',
          path: UPLOAD_ROUTE,
          handler: (req, res) => {
            if ((req.method ?? '') !== 'POST') {
              replyJson(res, 405, { ok: false, error: 'method-not-allowed' })
              return
            }
            let params
            try {
              params = new URL(req.url ?? '/', 'http://127.0.0.1').searchParams
            } catch {
              replyJson(res, 400, { ok: false, error: 'bad-url' })
              return
            }
            const rawName = String(params.get('name') ?? '')
            const kind = params.get('kind') === 'image' ? 'image' : 'video'
            const ext = path.extname(rawName).toLowerCase()
            const table = kind === 'video' ? VIDEO_EXT : IMAGE_EXT
            if (!table.has(ext)) {
              replyJson(res, 415, {
                ok: false,
                error: 'unsupported-type',
                message: kind === 'video' ? '启动动画只接受视频文件（mp4/webm/mov/m4v/ogv）' : '不支持的图片格式（png/jpg/webp/gif/avif）',
              })
              return
            }

            const id = crypto.randomUUID()
            const file = `${id}${ext}`
            const target = path.join(mediaDir(), file)
            const tmp = `${target}.part`
            const name = path.basename(rawName).slice(0, 160) || file

            // 先看 Content-Length：浏览器上传 File 时一定带它，能一次性干净地拒绝，
            // 不必先把 200MB 读进管道再中断。
            const declared = Number(req.headers['content-length'])
            if (Number.isFinite(declared) && declared > MAX_BYTES) {
              replyJson(res, 413, {
                ok: false,
                error: 'too-large',
                message: `文件超过 ${Math.round(MAX_BYTES / 1024 / 1024)} MB 上限`,
              })
              // 把剩下的字节排掉，浏览器才能读到这份响应。
              req.resume()
              return
            }

            let written = 0
            let aborted = false
            try {
              fs.mkdirSync(mediaDir(), { recursive: true })
            } catch (error) {
              replyJson(res, 500, { ok: false, error: describe(error) })
              return
            }
            const out = fs.createWriteStream(tmp)

            const fail = (status, error, message) => {
              if (aborted) return
              aborted = true
              try {
                out.destroy()
              } catch {
                /* ignore */
              }
              try {
                fs.rmSync(tmp, { force: true })
              } catch {
                /* ignore */
              }
              // 先回响应、再排空请求体：先 destroy 的话 socket 已经没了，
              // 浏览器只会看到"网络错误"，拿不到这条 413。
              replyJson(res, status, { ok: false, error, message })
              try {
                req.resume()
              } catch {
                /* ignore */
              }
            }

            req.on('data', (chunk) => {
              if (aborted) return
              written += chunk.length
              if (written > MAX_BYTES) {
                fail(413, 'too-large', `文件超过 ${Math.round(MAX_BYTES / 1024 / 1024)} MB 上限`)
              }
            })
            req.on('error', () => fail(400, 'stream-error', '上传中断'))
            out.on('error', (error) => fail(500, 'write-failed', describe(error)))
            out.on('finish', () => {
              if (aborted) return
              if (written <= 0) {
                try {
                  fs.rmSync(tmp, { force: true })
                } catch {
                  /* ignore */
                }
                replyJson(res, 400, { ok: false, error: 'empty-file', message: '文件是空的' })
                return
              }
              try {
                fs.renameSync(tmp, target)
                const deck = readDeck()
                const item = {
                  id,
                  file,
                  name,
                  kind,
                  ext,
                  mime: table.get(ext),
                  size: written,
                  createdAt: Date.now(),
                }
                deck.items.push(item)
                writeDeck(deck)
                replyJson(res, 200, { ok: true, item, ...snapshot() })
              } catch (error) {
                try {
                  fs.rmSync(tmp, { force: true })
                } catch {
                  /* ignore */
                }
                replyJson(res, 500, { ok: false, error: describe(error) })
              }
            })
            req.pipe(out)
          },
        }),
      )

      // 切启动动画 / 切背景
      disposers.push(
        child.webServer.register({
          kind: 'exact',
          path: SETTINGS_ROUTE,
          handler: async (req, res) => {
            if ((req.method ?? '') !== 'POST') {
              replyJson(res, 405, { ok: false, error: 'method-not-allowed' })
              return
            }
            let body
            try {
              body = await readJsonBody(req)
            } catch (error) {
              replyJson(res, 400, { ok: false, error: 'bad-body', message: describe(error) })
              return
            }
            if (typeof body !== 'object' || body === null) {
              replyJson(res, 400, { ok: false, error: 'bad-body' })
              return
            }
            const deck = readDeck()
            const patch = /** @type {Record<string, unknown>} */ (body)

            if ('bootId' in patch) {
              const next = patch.bootId
              if (next === null) {
                deck.settings.bootId = null
              } else {
                const item = ensureItem(next)
                if (item === undefined) {
                  replyJson(res, 404, { ok: false, error: 'unknown-item' })
                  return
                }
                // 纠错第二道闸：启动动画只能是视频。
                if (item.kind !== 'video') {
                  replyJson(res, 400, {
                    ok: false,
                    error: 'boot-must-be-video',
                    message: '启动动画只能使用视频文件，图片不能设为启动动画',
                  })
                  return
                }
                deck.settings.bootId = item.id
              }
            }

            if ('backgroundId' in patch) {
              const next = patch.backgroundId
              if (next === null) {
                deck.settings.backgroundId = null
              } else {
                const item = ensureItem(next)
                if (item === undefined) {
                  replyJson(res, 404, { ok: false, error: 'unknown-item' })
                  return
                }
                deck.settings.backgroundId = item.id
              }
            }

            if ('bootVolume' in patch) {
              const raw = patch.bootVolume
              // 只收真数字：字符串、NaN、Infinity 一律拒绝，不做"尽力而为"的猜测。
              if (typeof raw !== 'number' || !Number.isFinite(raw)) {
                replyJson(res, 400, {
                  ok: false,
                  error: 'bad-volume',
                  message: '音量必须是 0 到 1 之间的数字',
                })
                return
              }
              deck.settings.bootVolume = clampUnit(raw, DEFAULT_BOOT_VOLUME)
            }

            if ('backgroundStrength' in patch) {
              const raw = patch.backgroundStrength
              if (typeof raw !== 'number' || !Number.isFinite(raw)) {
                replyJson(res, 400, {
                  ok: false,
                  error: 'bad-strength',
                  message: '背景强度必须是 0 到 1 之间的数字',
                })
                return
              }
              deck.settings.backgroundStrength = clampUnit(raw, DEFAULT_BACKGROUND_STRENGTH)
            }

            if ('backgroundBlur' in patch) {
              const raw = patch.backgroundBlur
              if (typeof raw !== 'number' || !Number.isFinite(raw)) {
                replyJson(res, 400, {
                  ok: false,
                  error: 'bad-blur',
                  message: `背景模糊必须是 0 到 ${MAX_BACKGROUND_BLUR} 之间的数字`,
                })
                return
              }
              deck.settings.backgroundBlur = clampRange(raw, 0, 0, MAX_BACKGROUND_BLUR)
            }

            if ('bootWhen' in patch) {
              const raw = patch.bootWhen
              if (BOOT_WHEN_VALUES.indexOf(raw) < 0) {
                replyJson(res, 400, {
                  ok: false,
                  error: 'bad-boot-when',
                  message: `播放时机只能是 ${BOOT_WHEN_VALUES.join(' / ')}`,
                })
                return
              }
              deck.settings.bootWhen = raw
            }

            try {
              writeDeck(deck)
            } catch (error) {
              replyJson(res, 500, { ok: false, error: describe(error) })
              return
            }
            replyJson(res, 200, { ok: true, ...snapshot() })
          },
        }),
      )

      // 删除素材
      disposers.push(
        child.webServer.register({
          kind: 'exact',
          path: ITEM_ROUTE,
          handler: (req, res) => {
            if ((req.method ?? '') !== 'DELETE') {
              replyJson(res, 405, { ok: false, error: 'method-not-allowed' })
              return
            }
            let id = ''
            try {
              id = String(new URL(req.url ?? '/', 'http://127.0.0.1').searchParams.get('id') ?? '')
            } catch {
              replyJson(res, 400, { ok: false, error: 'bad-url' })
              return
            }
            const deck = readDeck()
            const index = deck.items.findIndex((item) => item.id === id)
            if (index < 0) {
              replyJson(res, 404, { ok: false, error: 'unknown-item' })
              return
            }
            const [item] = deck.items.splice(index, 1)
            if (deck.settings.backgroundId === id) deck.settings.backgroundId = null
            if (deck.settings.bootId === id) deck.settings.bootId = null
            try {
              // 只删自己记录过的文件名，不做任何路径拼接之外的猜测。
              fs.rmSync(path.join(mediaDir(), path.basename(String(item.file))), { force: true })
              writeDeck(deck)
            } catch (error) {
              replyJson(res, 500, { ok: false, error: describe(error) })
              return
            }
            replyJson(res, 200, { ok: true, ...snapshot() })
          },
        }),
      )

      // 媒体流
      disposers.push(
        child.webServer.register({
          kind: 'exact',
          path: MEDIA_ROUTE,
          handler: (req, res) => {
            let id = ''
            try {
              id = String(new URL(req.url ?? '/', 'http://127.0.0.1').searchParams.get('id') ?? '')
            } catch {
              replyJson(res, 400, { ok: false, error: 'bad-url' })
              return
            }
            const item = ensureItem(id)
            if (item === undefined) {
              replyJson(res, 404, { ok: false, error: 'unknown-item' })
              return
            }
            serveMedia(req, res, path.join(mediaDir(), path.basename(String(item.file))))
          },
        }),
      )

      // 界面诊断回执：设置页把"哪些容器有实心底色"采下来发过来，落成一个 JSON，
      // 用来定位"壁纸挂了但看不见"到底是被哪一层盖住的。
      disposers.push(
        child.webServer.register({
          kind: 'exact',
          path: REPORT_ROUTE,
          handler: async (req, res) => {
            if ((req.method ?? '') !== 'POST') {
              replyJson(res, 405, { ok: false, error: 'method-not-allowed' })
              return
            }
            let body
            try {
              body = await readJsonBody(req, 512 * 1024)
            } catch (error) {
              replyJson(res, 400, { ok: false, error: describe(error) })
              return
            }
            const text = JSON.stringify(body ?? null, null, 2)
            try {
              fs.mkdirSync(dataDir(), { recursive: true })
              fs.writeFileSync(path.join(dataDir(), 'client-report.json'), `${text}\n`, 'utf8')
            } catch (error) {
              replyJson(res, 500, { ok: false, error: describe(error) })
              return
            }
            replyJson(res, 200, { ok: true, bytes: Buffer.byteLength(text) })
          },
        }),
      )

      // 运行时在开场播完之后打一次卡：宿主记下时间，"每天一次 / 仅首次"靠它判断。
      disposers.push(
        child.webServer.register({
          kind: 'exact',
          path: BOOT_SHOWN_ROUTE,
          handler: async (req, res) => {
            if ((req.method ?? '') !== 'POST') {
              replyJson(res, 405, { ok: false, error: 'method-not-allowed' })
              return
            }
            let body
            try {
              body = await readJsonBody(req)
            } catch (error) {
              replyJson(res, 400, { ok: false, error: describe(error) })
              return
            }
            const at = body && typeof body.at === 'number' && Number.isFinite(body.at) ? body.at : Date.now()
            const deck = readDeck()
            deck.settings.bootShownAt = at
            try {
              writeDeck(deck)
            } catch (error) {
              replyJson(res, 500, { ok: false, error: describe(error) })
              return
            }
            replyJson(res, 200, { ok: true, at })
          },
        }),
      )

      info(`接口已就绪：${ROUTE_PREFIX}（数据目录 ${dataDir()}）`)

      return () => {
        for (const dispose of disposers) {
          try {
            dispose()
          } catch {
            /* 已经注销 */
          }
        }
      }
    })
  })

  // ── ③ 自检：抓一次自己的首页，确认注入行真的进了 HTML。
  //     这份结果只是诊断用途（写到 diagnostics.json），失败不影响任何功能。
  const probeTimer = setTimeout(() => {
    const run = async () => {
      let origin = ''
      try {
        origin = ctx.get('webServer')?.getOrigin?.() ?? ''
      } catch {
        origin = ''
      }
      if (origin === '') return
      let url = `${origin}/`
      try {
        url = ctx.get('connection')?.authenticatedUrl?.(`${origin}/`) ?? url
      } catch {
        /* 没有 connection 服务时用裸 URL，服务端会 401，那就只记状态码 */
      }
      try {
        const response = await fetch(url, { cache: 'no-store' })
        const html = await response.text()
        // 宿主编出来的注入表里到底有没有自己的两行 —— 这是"注入是否成立"的唯一硬证据
        // （首页 HTML 需要鉴权，取不到时状态码会是 401，那不代表注入没成立）。
        let table = []
        try {
          const collected = ctx.get('webServer')?.collectIndexInjections?.()
          if (Array.isArray(collected)) table = collected
        } catch {
          table = []
        }
        const own = table.filter((row) => {
          try {
            const text = JSON.stringify(row)
            return text.includes('__VD_BASE__') || text.includes('vd-backdrop')
          } catch {
            return false
          }
        })
        const report = {
          at: new Date().toISOString(),
          status: response.status,
          bytes: html.length,
          injectionSeen: html.includes('__VD_BASE__'),
          runtimeSeen: html.includes('vd-backdrop'),
          tableRows: table.length,
          ownRows: own.length,
        }
        fs.mkdirSync(dataDir(), { recursive: true })
        fs.writeFileSync(path.join(dataDir(), 'diagnostics.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
      } catch (error) {
        warn(`自检失败（忽略）：${describe(error)}`)
      }
    }
    run().catch(() => {})
  }, 2500)
  probeTimer.unref?.()

  try {
    const deck = readDeck()
    const bg = deck.settings.backgroundId
    const boot = deck.settings.bootId
    info(
      `素材 ${deck.items.length} 个 · 背景 ${bg === null ? '未设置' : bg} · 启动动画 ${boot === null ? '未设置' : boot}`,
    )
  } catch (error) {
    warn(`清单读取失败：${describe(error)}`)
  }
}
