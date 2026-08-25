/**
 * SkillManager: settings tab that lists the skills in dsh's own directory
 * (~/.dsh/skills, sourced through the host RPC) and opens the import dialog.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { NS } from './locales.ts'
import { skillRpc, deleteSkillEndpoint, fetchWorkspaces, uploadSkillEndpoint, type UploadSkillFile } from './index.ts'
import { DshDropdown } from './DshDropdown.tsx'
import css from './skill-manager.module.css'
import { ImportDialog } from './ImportDialog.tsx'
import { UploadSkillDialog } from './UploadSkillDialog.tsx'
import { SkillDetailDialog } from './SkillDetailDialog.tsx'
import type { ExternalSkill } from './skill-types.ts'

export type SkillManagerProps = PropsRuntime<'settings.section'> & PropsLocale<typeof NS>

/** One skill row shown in the list (a JSON-safe slice of the host's ExternalSkill). */
interface SkillInfo {
  readonly name: string
  readonly description: string
  readonly path: string
  readonly files?: readonly string[]
  readonly isSymlink?: boolean
  readonly linkTarget?: string
}

const DSH_SOURCE = 'dsh'
const GLOBAL_TARGET = 'global'

export function SkillManager({ t }: SkillManagerProps): JSX.Element {
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<SkillInfo | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [selectedDetail, setSelectedDetail] = useState<ExternalSkill | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [workspacePaths, setWorkspacePaths] = useState<readonly string[]>([])
  const [target, setTarget] = useState(GLOBAL_TARGET)
  const loadRequestRef = useRef(0)
  const hasLoadedRef = useRef(false)

  const load = useCallback(async () => {
    const requestId = loadRequestRef.current + 1
    loadRequestRef.current = requestId
    const initialLoad = !hasLoadedRef.current
    if (initialLoad) setLoading(true)
    else setRefreshing(true)
    setLoadError(null)
    try {
      const list = await skillRpc<Array<Omit<SkillInfo, 'enabled'>>>('scan', {
        source: DSH_SOURCE,
        target,
      })
      if (requestId !== loadRequestRef.current) return
      setSkills(list)
      hasLoadedRef.current = true
    } catch (e) {
      if (requestId === loadRequestRef.current && initialLoad) setLoadError((e as Error).message)
    } finally {
      if (requestId === loadRequestRef.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [target])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    void fetchWorkspaces()
      .then((result) => setWorkspacePaths(result.workspaces ?? []))
      .catch(() => setWorkspacePaths([]))
  }, [])

  const workspaceOptions = useMemo(() => [
    { value: GLOBAL_TARGET, label: t('scope.global') },
    ...workspacePaths.map((path) => ({ value: path, label: path })),
  ], [t, workspacePaths])

  const filtered = useMemo(() => {
    if (!search.trim()) return skills
    const q = search.toLowerCase()
    return skills.filter((s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q))
  }, [skills, search])

  const deleteSkill = useCallback(async () => {
    if (!confirmDelete) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteSkillEndpoint(confirmDelete.name, target)
      setConfirmDelete(null)
      await load()
    } catch (error) {
      setDeleteError((error as Error).message)
    } finally {
      setDeleting(false)
    }
  }, [confirmDelete, load, target])

  const submitUpload = useCallback(async (name: string, files: readonly UploadSkillFile[]): Promise<boolean> => {
    setUploading(true)
    setUploadError(null)
    try {
      const result = await uploadSkillEndpoint(name, files, target)
      const hasOutcome = result.imported.length > 0 || result.skipped.length > 0
      if (result.failed.length > 0 && !hasOutcome) {
        setUploadError(result.failed[0]?.message ?? t('upload.failed'))
        return false
      }
      if (hasOutcome) await load()
      return hasOutcome
    } catch (error) {
      setUploadError((error as Error).message)
      return false
    } finally {
      setUploading(false)
    }
  }, [load, t, target])

  const uploadTargetLabel = workspaceOptions.find((option) => option.value === target)?.label ?? target
  const installedCount = skills.length

  return (
    <div className={css.root}>
      {/* Header */}
      <div className={css.header}>
        <h2 className={css.title}>{t('title')}</h2>
        <div className={css.subtitleRow}>
          <DshDropdown
            value={target}
            options={workspaceOptions}
            onChange={(value) => {
              hasLoadedRef.current = false
              setSkills([])
              setTarget(value)
            }}
            ariaLabel={t('scope.label')}
            className={css.dshDropdownScope}
          />
          <span className={css.skillCount}>{t('subtitle', { n: installedCount })}</span>
          <input
            type="text"
            className={css.searchInput}
            placeholder={t('searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Action bar */}
      <div className={css.actionBar}>
        <span className={css.installedLabel}>{t('installed', { n: installedCount })}</span>
        <div className={css.actionButtons}>
          <button type="button" className={`${css.actionBtn} ${refreshing ? css.actionBtnBusy : ''}`} title={t('btn.refresh')} onClick={() => void load()} disabled={refreshing || loading}>↻</button>
          <button type="button" className={css.actionBtn} title={t('btn.import')} onClick={() => setShowImport(true)}>{t('btn.importShort')}</button>
          <button type="button" className={css.actionBtn} title={t('btn.upload')} onClick={() => { setUploadError(null); setShowUpload(true) }} disabled={uploading}>
            {uploading ? t('upload.uploading') : t('btn.upload')}
          </button>
        </div>
      </div>

      {uploadError && <div className={css.uploadError} role="alert">{uploadError}</div>}

      {deleteError && <div className={css.uploadError} role="alert">{deleteError}</div>}

      {loading && <div className={css.empty}>{t('loading')}</div>}
      {!loading && loadError && <div className={css.empty}>{loadError}</div>}

      {/* Skill list */}
      {!loading && !loadError && (
        <div className={css.skillList}>
          {filtered.length === 0 && (
            <div className={css.empty}>
              <p>{t('empty')}</p>
              <p className={css.emptyHint}>{t('empty.import')}</p>
            </div>
          )}
          {filtered.map((skill) => (
            <div key={skill.name} className={css.skillRow}>
              <button
                type="button"
                className={css.skillInfoButton}
                onClick={() => setSelectedDetail({
                  name: skill.name,
                  description: skill.description,
                  source: DSH_SOURCE,
                  path: skill.path,
                  files: skill.files ?? ['SKILL.md'],
                  isSymlink: skill.isSymlink,
                  linkTarget: skill.linkTarget,
                })}
              >
                <div className={css.skillInfo}>
                  <div className={css.skillName}>
                    {skill.name}
                    {skill.isSymlink && <span className={css.linkBadge}>symlink</span>}
                  </div>
                  <div className={css.skillDesc}>{skill.description}</div>
                  <div className={css.skillMeta}>
                    <span className={css.skillPath}>{skill.path}</span>
                    {skill.linkTarget && <span className={css.linkTarget}>→ {skill.linkTarget}</span>}
                  </div>
                </div>
              </button>
              <div className={css.skillActions}>
                <button
                  type="button"
                  className={css.deleteBtn}
                  onClick={(event) => {
                    event.stopPropagation()
                    setConfirmDelete(skill)
                  }}
                  title={t('btn.delete')}
                >{t('btn.delete')}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showUpload && (
        <UploadSkillDialog
          t={t}
          targetLabel={uploadTargetLabel}
          uploading={uploading}
          error={uploadError}
          onClose={() => { if (!uploading) { setShowUpload(false); setUploadError(null) } }}
          onSubmit={submitUpload}
        />
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className={css.modal} role="presentation">
          <section className={css.confirmDialog} role="alertdialog" aria-modal="true" aria-labelledby="delete-skill-title" aria-describedby="delete-skill-description">
            <header className={css.confirmHeader}>
              <div>
                <h3 id="delete-skill-title">{t('delete.title')}</h3>
                <p id="delete-skill-description">{t('delete.message', { name: confirmDelete.name })}</p>
              </div>
              <button type="button" className={css.iconButton} aria-label={t('btn.cancel')} onClick={() => setConfirmDelete(null)} disabled={deleting}>×</button>
            </header>
            <div className={css.confirmBody}>
              <div className={css.confirmSkillName}>{confirmDelete.name}</div>
              <div className={css.confirmPath}>{confirmDelete.path}</div>
              <div className={css.confirmWarning}>
                {confirmDelete.isSymlink ? t('delete.symlinkWarning') : t('delete.directoryWarning')}
              </div>
              {deleteError && <div className={css.confirmError} role="alert">{deleteError}</div>}
            </div>
            <footer className={css.confirmFooter}>
              <button type="button" className={css.modalBtn} onClick={() => setConfirmDelete(null)} disabled={deleting}>{t('btn.cancel')}</button>
              <button type="button" className={css.modalBtnDanger} onClick={() => void deleteSkill()} disabled={deleting}>
                {deleting ? t('delete.deleting') : t('btn.confirm')}
              </button>
            </footer>
          </section>
        </div>
      )}

      {/* Import dialog */}
      {selectedDetail && (
        <SkillDetailDialog
          skill={selectedDetail}
          sourceLabel={t('source.dsh')}
          t={t}
          onClose={() => setSelectedDetail(null)}
        />
      )}
      {showImport && (
        <ImportDialog
          t={t}
          onClose={() => setShowImport(false)}
          onImported={() => {
            void load()
          }}
        />
      )}
    </div>
  )
}
