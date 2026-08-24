/**
 * ImportDialog: import skills from other agent platforms.
 * Sources are detected on the host, collapsed by default, and scanned before the
 * dialog is shown. An explicit refresh re-scans all detected sources so the
 * summary counts remain accurate.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchWorkspaces, skillRpc } from './index.ts'
import { SkillDetailDialog } from './SkillDetailDialog.tsx'
import { DshDropdown } from './DshDropdown.tsx'
import type { ExternalSkill, ImportResult } from './skill-types.ts'
import css from './skill-manager.module.css'

interface SourceInfo {
  readonly key: string
  readonly path: string
}

interface ImportDialogProps {
  readonly t: (key: string, vars?: Record<string, string | number>) => string
  readonly onClose: () => void
  readonly onImported: (count: number) => void
}

const SOURCE_LABELS: Record<string, string> = {
  codex: 'Codex CLI',
  claude: 'Claude Code',
  zcode: 'ZCode',
  workbuddy: 'WorkBuddy',
  qcoderwork: 'QCoderWork',
}

const selectionKey = (source: string, name: string): string => `${source}:${name}`

function sourceLabel(key: string, t: ImportDialogProps['t']): string {
  return SOURCE_LABELS[key] ?? t(`source.${key}`)
}

export function ImportDialog({ t, onClose, onImported }: ImportDialogProps): JSX.Element {
  const [sources, setSources] = useState<SourceInfo[]>([])
  const [loadingSources, setLoadingSources] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set())
  const [scanned, setScanned] = useState<Record<string, ExternalSkill[]>>({})
  const [scanning, setScanning] = useState<Record<string, boolean>>({})
  const [failedSources, setFailedSources] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [mode, setMode] = useState<'copy' | 'symlink'>('copy')
  const [target, setTarget] = useState<string>('global')
  const [workspaces, setWorkspaces] = useState<readonly string[]>([])
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [selectedDetail, setSelectedDetail] = useState<ExternalSkill | null>(null)
  const detectInFlightRef = useRef(false)
  const hasLoadedSourcesRef = useRef(false)
  const scanGenerationRef = useRef(0)
  const scannedRef = useRef<Record<string, ExternalSkill[]>>({})
  const scanningRef = useRef<Record<string, boolean>>({})

  const scanSource = useCallback(async (source: string, options: { generation?: number; force?: boolean } = {}): Promise<ExternalSkill[] | null> => {
    const generation = options.generation ?? scanGenerationRef.current
    if (generation !== scanGenerationRef.current) return null
    if (!options.force && (scannedRef.current[source] !== undefined || scanningRef.current[source])) return scannedRef.current[source] ?? null
    scanningRef.current = { ...scanningRef.current, [source]: true }
    setScanning(scanningRef.current)
    setFailedSources((prev) => {
      const next = new Set(prev)
      next.delete(source)
      return next
    })
    try {
      const list = await skillRpc<ExternalSkill[]>('scan', { source })
      if (generation !== scanGenerationRef.current) return null
      scannedRef.current = { ...scannedRef.current, [source]: list }
      setScanned(scannedRef.current)
      return list
    } catch {
      if (generation !== scanGenerationRef.current) return null
      scannedRef.current = { ...scannedRef.current, [source]: [] }
      setScanned(scannedRef.current)
      setFailedSources((prev) => new Set(prev).add(source))
      return []
    } finally {
      if (generation === scanGenerationRef.current) {
        scanningRef.current = { ...scanningRef.current, [source]: false }
        setScanning(scanningRef.current)
      }
    }
  }, [])

  const detectSources = useCallback(async () => {
    if (detectInFlightRef.current) return
    const initialLoad = !hasLoadedSourcesRef.current
    const generation = scanGenerationRef.current + 1
    scanGenerationRef.current = generation
    detectInFlightRef.current = true
    if (initialLoad) setLoadingSources(true)
    else {
      setRefreshing(true)
      setExpandedSources(new Set())
      scannedRef.current = {}
      setScanned({})
      scanningRef.current = {}
      setScanning({})
      setFailedSources(new Set())

      setSelected(new Set())
      setImportResult(null)
    }
    try {
      const result = await skillRpc<{ sources: SourceInfo[] }>('detect')
      const detected = (result.sources ?? []).filter((source) => source.key !== 'dsh')
      if (generation !== scanGenerationRef.current) return
      setSources(detected)
      setExpandedSources(new Set())
      setSelected(new Set())
      setImportResult(null)
      hasLoadedSourcesRef.current = true
      const entries = await Promise.all(detected.map(async (source) => {
        const list = await scanSource(source.key, { generation, force: true })
        return [source.key, list ?? []] as const
      }))
      if (generation !== scanGenerationRef.current) return
      scannedRef.current = Object.fromEntries(entries)
      setScanned(scannedRef.current)
    } catch {
      if (initialLoad) setSources([])
    } finally {
      detectInFlightRef.current = false
      if (initialLoad) setLoadingSources(false)
      else setRefreshing(false)
    }
  }, [scanSource])

  useEffect(() => { void detectSources() }, [detectSources])

  useEffect(() => {
    void fetchWorkspaces()
      .then((result) => setWorkspaces(result.workspaces ?? []))
      .catch(() => setWorkspaces([]))
  }, [])

  const toggleSource = useCallback((source: SourceInfo) => {
    const shouldExpand = !expandedSources.has(source.key)
    setExpandedSources((prev) => {
      const next = new Set(prev)
      if (next.has(source.key)) next.delete(source.key)
      else next.add(source.key)
      return next
    })
    if (shouldExpand) void scanSource(source.key)
  }, [expandedSources, scanSource])

  const loadedSkills = useMemo(() => sources.flatMap((source) => scanned[source.key] ?? []), [sources, scanned])
  const discoverableCount = loadedSkills.length
  const selectedSkills = useMemo(() => loadedSkills.filter((skill) => selected.has(selectionKey(skill.source, skill.name))), [loadedSkills, selected])
  const selectedCount = selectedSkills.length
  const allLoadedSelected = discoverableCount > 0 && selectedCount === discoverableCount

  const toggleSkill = useCallback((skill: ExternalSkill) => {
    const key = selectionKey(skill.source, skill.name)
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const toggleSourceSkills = useCallback((source: SourceInfo) => {
    const skills = scanned[source.key] ?? []
    if (skills.length === 0) return
    const keys = skills.map((skill) => selectionKey(skill.source, skill.name))
    setSelected((prev) => {
      const next = new Set(prev)
      const everySelected = keys.every((key) => next.has(key))
      for (const key of keys) {
        if (everySelected) next.delete(key)
        else next.add(key)
      }
      return next
    })
  }, [scanned])

  const toggleAllLoaded = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const skill of loadedSkills) {
        const key = selectionKey(skill.source, skill.name)
        if (allLoadedSelected) next.delete(key)
        else next.add(key)
      }
      return next
    })
  }, [allLoadedSelected, loadedSkills])

  const doImport = useCallback(async () => {
    setImporting(true)
    setImportResult(null)
    try {
      const result = await skillRpc<ImportResult>('import', {
        mode,
        target,
        skills: selectedSkills.map((skill) => ({ source: skill.source, name: skill.name })),
      })
      setImportResult(result)
      setSelected(new Set())
      onImported(result.imported.length)
    } catch (error) {
      setImportResult({ imported: [], skipped: [], failed: [{ name: '', message: (error as Error).message }] })
    } finally {
      setImporting(false)
    }
  }, [mode, onImported, selectedSkills, target])

  const modeOptions = useMemo(() => [
    { value: 'copy', label: t('import.copy') },
    { value: 'symlink', label: t('import.symlink') },
  ], [t])
  const targetOptions = useMemo(() => [
    { value: 'global', label: t('import.globalTarget') },
    ...workspaces.map((path) => ({ value: path, label: path })),
  ], [t, workspaces])

  return (
    <div className={css.modal}>
      <section className={css.importDialog} role="dialog" aria-modal="true" aria-labelledby="skill-import-title">
        <header className={css.importHeader}>
          <h3 id="skill-import-title">{t('import.title')}</h3>
          <div className={css.importHeaderActions}>
            <span className={css.importScope}>
              {target === 'global' ? t('import.globalTarget') : target}
            </span>
            <button
              type="button"
              className={`${css.iconButton} ${refreshing ? css.iconButtonBusy : ''}`}
              aria-label={t('import.refresh')}
              aria-busy={refreshing}
              disabled={refreshing || loadingSources}
              onClick={() => void detectSources()}
            >↻</button>
            <button type="button" className={css.iconButton} aria-label={t('import.close')} onClick={onClose}>×</button>
          </div>
        </header>

        <div className={css.importBody}>
          {loadingSources ? (
            <div className={css.empty}>{t('loading')}</div>
          ) : sources.length === 0 ? (
            <div className={css.empty}>
              <p>{t('import.noSources')}</p>
              <p className={css.emptyHint}>{t('empty.import')}</p>
            </div>
          ) : (
            <>
              <div className={css.importListHeader}>
                <label className={css.importSelectAll}>
                  <input type="checkbox" checked={allLoadedSelected} onChange={toggleAllLoaded} />
                  <span>{t('import.selectAll')}</span>
                </label>
                <span className={css.importSelectedCount}>{t('import.selectedCount', { n: selectedCount, total: discoverableCount })}</span>
              </div>
              <div className={css.importGroups}>
                {sources.map((source) => {
                  const expanded = expandedSources.has(source.key)
                  const skills = scanned[source.key] ?? []
                  const sourceKeys = skills.map((skill) => selectionKey(skill.source, skill.name))
                  const sourceSelected = sourceKeys.length > 0 && sourceKeys.every((key) => selected.has(key))
                  return (
                    <section className={css.importGroup} key={source.key}>
                      <div className={css.importGroupHeader}>
                        <input
                          type="checkbox"
                          checked={sourceSelected}
                          disabled={skills.length === 0}
                          onChange={() => toggleSourceSkills(source)}
                          aria-label={`${t('import.selectAll')} ${sourceLabel(source.key, t)}`}
                        />
                        <button type="button" className={css.importGroupToggle} onClick={() => toggleSource(source)} aria-expanded={expanded}>
                          <span className={css.importGroupChevron} aria-hidden="true" />
                          <span className={css.importGroupName}>{sourceLabel(source.key, t)}</span>
                          <span className={css.importGroupPath}>{source.path}</span>
                          <span className={css.importGroupCount}>{scanning[source.key] ? t('loading') : t('import.sourceSkills', { n: skills.length })}</span>
                        </button>
                      </div>
                      {expanded && (
                        <div className={css.importGroupSkills}>
                          {scanning[source.key] && skills.length === 0 ? (
                            <div className={css.importNestedEmpty}>{t('loading')}</div>
                          ) : failedSources.has(source.key) ? (
                            <div className={css.importNestedEmpty}>{t('import.scanFailed')}</div>
                          ) : skills.length === 0 ? (
                            <div className={css.importNestedEmpty}>{t('empty')}</div>
                          ) : skills.map((skill) => {
                            const key = selectionKey(skill.source, skill.name)
                            return (
                              <div key={key} className={css.importSkillRow}>
                                <input type="checkbox" checked={selected.has(key)} onChange={() => toggleSkill(skill)} aria-label={`${t('import.selectAll')} ${skill.name}`} />
                                <button type="button" className={css.importSkillDetails} onClick={() => setSelectedDetail(skill)}>
                                  <span className={css.importSkillName}>{skill.name}</span>
                                  <span className={css.importSkillDesc}>{skill.description || t('detail.noDescription')}</span>
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </section>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {importResult && (
          <div className={css.modal} role="presentation">
            <section className={css.importResultDialog} role="dialog" aria-modal="true" aria-labelledby="import-result-title">
              <header className={css.importResultHeader}>
                <h3 id="import-result-title">{t('import.resultTitle')}</h3>
                <button type="button" className={css.iconButton} aria-label={t('import.close')} onClick={() => setImportResult(null)}>×</button>
              </header>
              <div className={css.importResultBody}>
                <div className={css.importResultSummary}>
                  <span><strong>{importResult.imported.length}</strong> {t('import.importedLabel')}</span>
                  <span><strong>{importResult.skipped.length}</strong> {t('import.skippedLabel')}</span>
                  <span><strong>{importResult.failed.length}</strong> {t('import.failedLabel')}</span>
                </div>
                <h4 className={css.importResultHeading}>{t('import.resultHeading')}</h4>
                <div className={css.importResultList}>
                  {importResult.imported.map((name) => (
                    <div className={css.importResultItem} key={`imported:${name}`}>
                      <span className={css.importResultCheck} aria-hidden="true">✓</span>
                      <span>{name}</span>
                    </div>
                  ))}
                  {importResult.skipped.map((name) => (
                    <div className={css.importResultItem} key={`skipped:${name}`}>
                      <span className={css.importResultCheckMuted} aria-hidden="true">—</span>
                      <span>{name}</span>
                    </div>
                  ))}
                  {importResult.failed.map((item, index) => (
                    <div className={css.importResultItem} key={`failed:${item.name}:${index}`}>
                      <span className={css.importResultCheckMuted} aria-hidden="true">!</span>
                      <span>{item.name ? `${item.name}: ${item.message}` : item.message}</span>
                    </div>
                  ))}
                  {importResult.imported.length === 0 && importResult.skipped.length === 0 && importResult.failed.length === 0 && (
                    <div className={css.importResultEmpty}>{t('empty')}</div>
                  )}
                </div>
              </div>
              <footer className={css.confirmFooter}>
                <button type="button" className={css.modalBtnPrimary} onClick={() => setImportResult(null)}>{t('import.closeResult')}</button>
              </footer>
            </section>
          </div>
        )}

        <footer className={css.importFooter}>
          <div className={css.importFooterSummary}>{t('import.discovered', { n: discoverableCount })}</div>
          <label className={css.importSymlinkSelect}>
            <span>{t('import.linkMode')}</span>
            <DshDropdown
              className={css.dshDropdownMode}
              value={mode}
              options={modeOptions}
              onChange={(value) => setMode(value as 'copy' | 'symlink')}
              ariaLabel={t('import.linkMode')}
            />
          </label>
          <div className={css.importFooterControls}>
            <DshDropdown
              className={css.dshDropdownTarget}
              value={target}
              options={targetOptions}
              onChange={setTarget}
              ariaLabel={t('import.target')}
            />
            <button type="button" className={css.modalBtnPrimary} disabled={selectedCount === 0 || importing} onClick={() => void doImport()}>
              {importing ? '...' : t('import.selected', { n: selectedCount })}
            </button>
          </div>
        </footer>
      </section>
      {selectedDetail && <SkillDetailDialog skill={selectedDetail} sourceLabel={sourceLabel(selectedDetail.source, t)} t={t} onClose={() => setSelectedDetail(null)} />}
    </div>
  )
}
