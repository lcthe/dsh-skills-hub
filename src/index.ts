/**
 * Host loader entry for the dsh-skills-hub plugin. The browser client scans the
 * host's home directory by calling my own HTTP endpoints under
 * /dsh-skills-hub-api (registered on the shared webServer): `detect` reports
 * which agent config directories actually exist, and `scan` returns the skill
 * directories under one source.
 */
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { existsSync, cpSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, renameSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-workspace'

const MAX_BODY_BYTES = 16 * 1024 * 1024
const MAX_UPLOAD_FILES = 500
const MAX_UPLOAD_FILE_BYTES = 4 * 1024 * 1024
const MAX_UPLOAD_TOTAL_BYTES = 12 * 1024 * 1024

export interface ExternalSkill {
  readonly name: string
  readonly description: string
  readonly source: string
  readonly path: string
  readonly files: readonly string[]
  readonly isSymlink: boolean
  readonly linkTarget?: string
}

export interface SourceInfo {
  readonly key: string
  readonly path: string
}

export interface ImportRequestSkill {
  readonly source: string
  readonly name: string
}

export interface ImportResult {
  readonly imported: readonly string[]
  readonly skipped: readonly string[]
  readonly failed: readonly { readonly name: string; readonly message: string }[]
}

/** Agent sources by key: home-relative directory candidates that may hold skills. */
const SOURCE_PATHS: Record<string, readonly string[]> = {
  dsh: ['.dsh/skills'],
  codex: ['.codex/skills', '.codex/vendor_imports/skills', '.codex/plugins/cache'],
  claude: ['.claude/skills'],
  zcode: ['.zcode/skills', '.zcode/cli/plugins/cache'],
  workbuddy: ['.workbuddy/skills'],
  qcoderwork: ['.qcoderwork/skills'],
}

function isDirectory(path: string): boolean {
  try { return statSync(path).isDirectory() } catch { /* missing or unreadable */ }
  return false
}

function skillDescription(dir: string, firstMd: string): string {
  try {
    const content = readFileSync(join(dir, firstMd), 'utf-8')
    const frontmatter = content.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/)
    if (frontmatter !== null) {
      const lines = frontmatter[1].split('\n')
      const descriptionIndex = lines.findIndex((line) => /^description:\s*/.test(line))
      if (descriptionIndex >= 0) {
        const value = lines[descriptionIndex].replace(/^description:\s*/, '').trim()
        if (value === '|' || value === '>') {
          const descriptionLines: string[] = []
          for (const line of lines.slice(descriptionIndex + 1)) {
            if (!/^\s+/.test(line) && line.trim() !== '') break
            if (line.trim()) descriptionLines.push(line.trim())
          }
          const block = descriptionLines.join(' ')
          if (block) return block
        } else if (value) {
          return value.replace(/^(?:["'])(.*)(?:["'])$/, '$1').trim()
        }
      }
    }
    const body = frontmatter === null ? content : content.slice(frontmatter[0].length)
    return body
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length > 0 && !line.startsWith('#')) ?? ''
  } catch { /* unreadable */ }
  return ''
}

function scanSkillDir(dir: string, source: string): ExternalSkill[] {
  const skills: ExternalSkill[] = []
  let entries
  try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return skills }
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
    const path = join(dir, entry.name)
    if (!isDirectory(path)) continue
    let linkTarget: string | undefined
    if (entry.isSymbolicLink()) {
      try { linkTarget = readlinkSync(path) } catch { /* ignore */ }
    }
    const mdFiles = readdirSync(path).filter((f: string) => f.endsWith('.md'))
    if (mdFiles.length === 0) continue
    skills.push({
      name: entry.name,
      description: skillDescription(path, mdFiles[0]),
      source,
      path,
      files: mdFiles,
      isSymlink: entry.isSymbolicLink(),
      linkTarget,
    })
  }
  return skills
}

function scanSource(source: string): ExternalSkill[] {
  const home = homedir()
  const all: ExternalSkill[] = []
  for (const rel of SOURCE_PATHS[source] ?? []) {
    const abs = join(home, rel)
    if (!isDirectory(abs)) continue
    all.push(...scanSkillDir(abs, source))
    // Cache layouts nest a `skills/` directory one level down.
    let subs
    try { subs = readdirSync(abs, { withFileTypes: true }) } catch { continue }
    for (const sub of subs) {
      if (!sub.isDirectory()) continue
      const skillsDir = join(abs, sub.name, 'skills')
      if (isDirectory(skillsDir)) all.push(...scanSkillDir(skillsDir, source))
    }
  }
  return all
}

function detectSources(): SourceInfo[] {
  const home = homedir()
  const sources: SourceInfo[] = []
  for (const [key, paths] of Object.entries(SOURCE_PATHS)) {
    const relative = paths.find((rel) => existsSync(join(home, rel)))
    if (relative !== undefined) sources.push({ key, path: join(home, relative) })
  }
  return sources
}

function importSkills(requested: unknown, mode: unknown, destinationRoot: string): ImportResult {
  const result: { imported: string[]; skipped: string[]; failed: { name: string; message: string }[] } = {
    imported: [],
    skipped: [],
    failed: [],
  }
  if (mode !== 'copy' && mode !== 'symlink') {
    return { ...result, failed: [{ name: '', message: 'invalid import mode' }] }
  }
  if (!Array.isArray(requested) || requested.length > 200) {
    return { ...result, failed: [{ name: '', message: 'invalid skill selection' }] }
  }
  mkdirSync(destinationRoot, { recursive: true })
  const seen = new Set<string>()
  for (const item of requested) {
    if (typeof item !== 'object' || item === null) {
      result.failed.push({ name: '', message: 'invalid skill selection' })
      continue
    }
    const { source, name } = item as Record<string, unknown>
    if (typeof source !== 'string' || typeof name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) {
      result.failed.push({ name: typeof name === 'string' ? name : '', message: 'invalid skill selection' })
      continue
    }
    const key = `${source}:${name}`
    if (seen.has(key)) continue
    seen.add(key)
    const skill = scanSource(source).find((candidate) => candidate.name === name)
    if (skill === undefined) {
      result.failed.push({ name, message: 'skill is no longer available from this source' })
      continue
    }
    const destination = join(destinationRoot, name)
    if (existsSync(destination)) {
      result.skipped.push(name)
      continue
    }
    try {
      if (mode === 'symlink') symlinkSync(skill.path, destination, 'dir')
      else cpSync(skill.path, destination, { recursive: true, dereference: false, errorOnExist: true })
      result.imported.push(name)
    } catch (error) {
      result.failed.push({ name, message: error instanceof Error ? error.message : String(error) })
    }
  }
  return result
}

/** Normalize a browser-supplied relative path segment; rejects traversal and blanks. */
function normalizeUploadPath(rel: string): string | null {
  if (rel.includes('\0')) return null
  const segments = rel.split(/[\\/]+/).filter(Boolean)
  if (segments.length === 0 || segments.some((s) => s === '..' || s === '.' || s === '')) return null
  return join(...segments)
}

function isBase64(content: string): boolean {
  if (content.length === 0 || content.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(content)) return false
  try {
    return Buffer.from(content, 'base64').toString('base64').replace(/=+$/, '') === content.replace(/=+$/, '')
  } catch {
    return false
  }
}

/** Write a browser upload into a temporary directory and commit it atomically. */
function importUploadedSkill(name: unknown, files: unknown, destinationRoot: string): ImportResult {
  const failed: { name: string; message: string }[] = []
  if (typeof name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) {
    return { imported: [], skipped: [], failed: [{ name: String(name ?? ''), message: 'invalid skill name' }] }
  }
  if (!Array.isArray(files) || files.length === 0 || files.length > MAX_UPLOAD_FILES) {
    return { imported: [], skipped: [], failed: [{ name, message: 'invalid upload file count' }] }
  }
  mkdirSync(destinationRoot, { recursive: true })
  const destination = join(destinationRoot, name)
  if (existsSync(destination)) return { imported: [], skipped: [name], failed: [] }
  const tempDirectory = join(destinationRoot, `.${name}.upload-${process.pid}-${Date.now()}`)
  let validFiles = 0
  let totalBytes = 0
  try {
    mkdirSync(tempDirectory, { recursive: true })
    for (const item of files) {
      if (typeof item !== 'object' || item === null) {
        failed.push({ name, message: 'invalid upload file' })
        continue
      }
      const { path: rel, content } = item as Record<string, unknown>
      if (typeof rel !== 'string' || typeof content !== 'string') {
        failed.push({ name, message: 'invalid upload file' })
        continue
      }
      const safe = normalizeUploadPath(rel)
      if (safe === null || !isBase64(content)) {
        failed.push({ name, message: `invalid upload file: ${rel}` })
        continue
      }
      const bytes = Buffer.from(content, 'base64')
      if (bytes.length > MAX_UPLOAD_FILE_BYTES || totalBytes + bytes.length > MAX_UPLOAD_TOTAL_BYTES) {
        failed.push({ name, message: `upload exceeds size limit: ${rel}` })
        continue
      }
      const target = join(tempDirectory, safe)
      if (target !== tempDirectory && !target.startsWith(`${tempDirectory}/`)) {
        failed.push({ name, message: `invalid upload path: ${rel}` })
        continue
      }
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, bytes, { flag: 'wx' })
      validFiles += 1
      totalBytes += bytes.length
    }
    if (validFiles === 0 || failed.length > 0) {
      return { imported: [], skipped: [], failed: failed.length > 0 ? failed : [{ name, message: 'no valid files provided' }] }
    }
    renameSync(tempDirectory, destination)
    return { imported: [name], skipped: [], failed: [] }
  } catch (error) {
    return { imported: [], skipped: [], failed: [{ name, message: error instanceof Error ? error.message : String(error) }] }
  } finally {
    if (existsSync(tempDirectory)) rmSync(tempDirectory, { recursive: true, force: true })
  }
}

function deleteSkill(name: unknown, destinationRoot: string): { name: string; path?: string; symlink?: boolean; error?: string } {
  if (typeof name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) {
    return { name: String(name ?? ''), error: 'invalid skill name' }
  }
  const target = join(destinationRoot, name)
  if (!target.startsWith(`${destinationRoot}/`) || target === destinationRoot) return { name, error: 'invalid skill path' }
  if (!existsSync(target)) return { name, path: target, error: 'skill does not exist' }
  try {
    const stat = lstatSync(target)
    if (stat.isSymbolicLink()) unlinkSync(target)
    else if (stat.isDirectory()) rmSync(target, { recursive: true, force: false })
    else return { name, path: target, error: 'skill path is not a directory or symlink' }
    return { name, path: target, symlink: stat.isSymbolicLink() }
  } catch (error) {
    return { name, path: target, error: error instanceof Error ? error.message : String(error) }
  }
}

function resolveDestinationRoot(target: unknown, workspaces: readonly string[]): { root: string } | { error: string } {
  if (target === undefined || target === null || target === '' || target === 'global') {
    return { root: join(homedir(), '.dsh', 'skills') }
  }
  if (typeof target !== 'string' || !workspaces.includes(target)) {
    return { error: 'import target is not a known workspace' }
  }
  return { root: join(target, '.dsh', 'skills') }
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let raw = ''
    let tooLarge = false
    req.on('data', (chunk: Buffer) => {
      if (tooLarge) return
      raw += chunk.toString()
      if (Buffer.byteLength(raw) > MAX_BODY_BYTES) tooLarge = true
    })
    req.on('end', () => {
      if (tooLarge) return resolve({ __bodyError: 'request body too large' })
      if (!raw) return resolve({})
      try { resolve(JSON.parse(raw)) } catch { resolve({ __bodyError: 'malformed JSON body' }) }
    })
  })
}

export const inject = ['webServer', 'workspaceRegistry']

const API_BASE = '/dsh-skills-hub-api'

/** Register the detect/scan JSON endpoints on the shared webServer. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: API_BASE,
    handler: async (req, res) => {
      if (req.method !== 'POST') return send(res, 405, { ok: false, error: { message: 'POST required' } })
      const parts = (req.url ?? '').split('?')[0].split('/').filter(Boolean)
      const endpoint = parts[parts.length - 1]
      const body = await readBody(req)
      if (typeof body.__bodyError === 'string') return send(res, 400, { ok: false, error: { message: body.__bodyError } })
      try {
        if (endpoint === 'detect') {
          return send(res, 200, { ok: true, value: { sources: detectSources() } })
        }
        if (endpoint === 'scan') {
          const source = typeof body.source === 'string' ? body.source : ''
          const target = body.target
          if (source === 'dsh' && target !== undefined) {
            const workspaces = ctx.workspaceRegistry.list().map((workspace) => workspace.path)
            const resolved = resolveDestinationRoot(target, workspaces)
            if ('error' in resolved) return send(res, 400, { ok: false, error: { message: resolved.error } })
            return send(res, 200, { ok: true, value: scanSkillDir(resolved.root, source) })
          }
          return send(res, 200, { ok: true, value: scanSource(source) })
        }
        if (endpoint === 'workspaces') {
          const workspaces = ctx.workspaceRegistry.list().map((workspace) => workspace.path)
          return send(res, 200, { ok: true, value: { global: join(homedir(), '.dsh', 'skills'), workspaces } })
        }
        if (endpoint === 'delete') {
          const workspaces = ctx.workspaceRegistry.list().map((workspace) => workspace.path)
          const resolved = resolveDestinationRoot(body.target, workspaces)
          if ('error' in resolved) return send(res, 400, { ok: false, error: { message: resolved.error } })
          const result = deleteSkill(body.name, resolved.root)
          if (result.error) return send(res, 400, { ok: false, error: { message: result.error } })
          return send(res, 200, { ok: true, value: result })
        }
        if (endpoint === 'import' || endpoint === 'upload') {
          const workspaces = ctx.workspaceRegistry.list().map((workspace) => workspace.path)
          const resolved = resolveDestinationRoot(body.target, workspaces)
          if ('error' in resolved) return send(res, 400, { ok: false, error: { message: resolved.error } })
          if (endpoint === 'import') {
            return send(res, 200, { ok: true, value: importSkills(body.skills, body.mode, resolved.root) })
          }
          return send(res, 200, { ok: true, value: importUploadedSkill(body.name, body.files, resolved.root) })
        }
        send(res, 404, { ok: false, error: { message: `unknown endpoint ${endpoint}` } })
      } catch (error) {
        send(res, 500, { ok: false, error: { message: String(error) } })
      }
    },
  }), 'dsh-skills-hub: api routes')
}
