import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { en, NS, zh } from './locales.ts'
import { SkillManager } from './SkillManager.tsx'

export const inject = ['slots', 'locale']

/** Call one `/dsh-skills-hub-api/*` host endpoint (same-origin fetch) and return its value. */
export async function skillRpc<T>(endpoint: string, args: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`/dsh-skills-hub-api/${endpoint}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(args),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error?.message ?? `dsh-skills-hub: ${endpoint} failed (${res.status})`)
  }
  return data.value as T
}

/** A raw base64-encoded file to be written into a new global skill directory. */
export interface UploadSkillFile {
  readonly path: string
  readonly content: string
}

/** Import targets exposed by the host: the global skills root plus each workspace. */
export interface WorkspacesResult {
  readonly global: string
  readonly workspaces: readonly string[]
}

/** Upload files for one new skill into ~/.dsh/skills and return the outcome. */
export function uploadSkillEndpoint(name: string, files: readonly UploadSkillFile[], target = 'global'): Promise<{ imported: string[]; skipped: string[]; failed: { name: string; message: string }[] }> {
  return skillRpc('upload', { name, files: files as unknown as Record<string, unknown>, target })
}

export function deleteSkillEndpoint(name: string, target = 'global'): Promise<{ name: string; path: string; symlink: boolean }> {
  return skillRpc('delete', { name, target })
}

/** Fetch the global skills root and every known workspace path. */
export function fetchWorkspaces(): Promise<WorkspacesResult> {
  return skillRpc<WorkspacesResult>('workspaces')
}

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-skills-hub: dictionaries')
  const t = ctx.locale.bind(NS)
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      { name: 'settings.section', id: 'skills', order: 25, label: () => t('tab'), locale: NS },
      SkillManager,
    ),
  )
}
