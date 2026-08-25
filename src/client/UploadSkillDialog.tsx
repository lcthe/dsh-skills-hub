import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import type { UploadSkillFile } from './index.ts'
import css from './skill-manager.module.css'

interface UploadSkillDialogProps {
  readonly t: (key: string, vars?: Record<string, string | number>) => string
  readonly targetLabel: string
  readonly uploading: boolean
  readonly error: string | null
  readonly onClose: () => void
  readonly onSubmit: (name: string, files: readonly UploadSkillFile[]) => Promise<boolean>
}

interface SelectedSkill {
  readonly name: string
  readonly files: readonly UploadSkillFile[]
  readonly bytes: number
}

interface FileSystemEntryLike {
  readonly isFile: boolean
  readonly isDirectory: boolean
  readonly name: string
}

interface FileSystemFileEntryLike extends FileSystemEntryLike {
  readonly isFile: true
  file: (callback: (file: File) => void, errorCallback?: (error: DOMException) => void) => void
}

interface FileSystemDirectoryEntryLike extends FileSystemEntryLike {
  readonly isDirectory: true
  createReader: () => {
    readEntries: (successCallback: (entries: FileSystemEntryLike[]) => void, errorCallback?: (error: DOMException) => void) => void
  }
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result)
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function readFile(entry: FileSystemFileEntryLike): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject))
}

async function readDirectory(entry: FileSystemDirectoryEntryLike, prefix = ''): Promise<{ files: UploadSkillFile[]; bytes: number }> {
  const reader = entry.createReader()
  const entries: FileSystemEntryLike[] = []
  while (true) {
    const batch = await new Promise<FileSystemEntryLike[]>((resolve, reject) => reader.readEntries(resolve, reject))
    if (batch.length === 0) break
    entries.push(...batch)
  }
  const files: UploadSkillFile[] = []
  let bytes = 0
  for (const child of entries) {
    const path = prefix ? `${prefix}/${child.name}` : child.name
    if (child.isDirectory) {
      const nested = await readDirectory(child as FileSystemDirectoryEntryLike, path)
      files.push(...nested.files)
      bytes += nested.bytes
    } else if (child.isFile) {
      const file = await readFile(child as FileSystemFileEntryLike)
      files.push({ path, content: await readAsBase64(file) })
      bytes += file.size
    }
  }
  return { files, bytes }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function selectionFromFiles(files: File[]): Promise<SelectedSkill | null> {
  const root = files[0]?.webkitRelativePath.split('/')[0] ?? ''
  if (!root) return null
  const uploadFiles: UploadSkillFile[] = []
  let bytes = 0
  for (const file of files) {
    const parts = file.webkitRelativePath.split('/')
    const path = parts.slice(1).join('/')
    if (!path) continue
    uploadFiles.push({ path, content: await readAsBase64(file) })
    bytes += file.size
  }
  return uploadFiles.length === 0 ? null : { name: root, files: uploadFiles, bytes }
}

export function UploadSkillDialog({ t, targetLabel, uploading, error, onClose, onSubmit }: UploadSkillDialogProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [selected, setSelected] = useState<SelectedSkill | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)

  const onPick = (event: ChangeEvent<HTMLInputElement>): void => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length === 0) return
    setLocalError(null)
    void selectionFromFiles(files).then((next) => {
      if (next === null) setLocalError(t('upload.invalidFolder'))
      else setSelected(next)
    }).catch((cause: unknown) => setLocalError(cause instanceof Error ? cause.message : t('upload.invalidFolder')))
  }

  const onDrop = async (event: DragEvent<HTMLDivElement>): Promise<void> => {
    event.preventDefault()
    setDragging(false)
    setLocalError(null)
    const items = Array.from(event.dataTransfer.items)
    const entries: FileSystemEntryLike[] = []
    for (const item of items) {
      const entry = typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null
      if (entry !== null) entries.push(entry as unknown as FileSystemEntryLike)
    }
    if (entries.length !== 1 || !entries[0]?.isDirectory) {
      setLocalError(t('upload.dropOneFolder'))
      return
    }
    try {
      const entry = entries[0] as unknown as FileSystemDirectoryEntryLike
      const result = await readDirectory(entry)
      if (result.files.length === 0) {
        setLocalError(t('upload.invalidFolder'))
        return
      }
      setSelected({ name: entry.name, files: result.files, bytes: result.bytes })
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : t('upload.invalidFolder'))
    }
  }

  const submit = async (): Promise<void> => {
    if (selected === null || uploading) return
    const success = await onSubmit(selected.name, selected.files)
    if (success) onClose()
  }

  return (
    <div className={css.modal} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !uploading) onClose() }}>
      <section className={css.uploadDialog} role="dialog" aria-modal="true" aria-labelledby="upload-skill-title">
        <header className={css.uploadHeader}>
          <div>
            <h3 id="upload-skill-title">{t('upload.title')}</h3>
            <p>{t('upload.target', { target: targetLabel })}</p>
          </div>
          <button type="button" className={css.iconButton} aria-label={t('btn.cancel')} onClick={onClose} disabled={uploading}>×</button>
        </header>
        <div className={css.uploadBody}>
          <div
            className={`${css.uploadDropZone} ${dragging ? css.uploadDropZoneActive : ''}`}
            role="button"
            tabIndex={uploading ? -1 : 0}
            onClick={() => { if (!uploading) inputRef.current?.click() }}
            onKeyDown={(event) => { if (!uploading && (event.key === 'Enter' || event.key === ' ')) inputRef.current?.click() }}
            onDragOver={(event) => { event.preventDefault(); if (!uploading) setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => void onDrop(event)}
          >
            {selected === null ? (
              <div className={css.uploadPlusButton} aria-hidden="true" />
            ) : (
              <div className={css.uploadSelectionInside}>
                <div className={css.uploadSelectionName}>{selected.name}</div>
                <div className={css.uploadSelectionMeta}>{t('upload.summary', { files: selected.files.length, size: formatBytes(selected.bytes) })}</div>
              </div>
            )}
          </div>
          <input ref={inputRef} type="file" className={css.hiddenFileInput} multiple {...{ webkitdirectory: '' }} onChange={onPick} />
          {(localError || error) && <div className={css.uploadDialogError} role="alert">{localError ?? error}</div>}
        </div>
        <footer className={css.confirmFooter}>
          <button type="button" className={css.modalBtn} onClick={onClose} disabled={uploading}>{t('btn.cancel')}</button>
          <button type="button" className={css.modalBtnPrimary} onClick={() => void submit()} disabled={selected === null || uploading}>
            {uploading ? t('upload.uploading') : t('upload.submit')}
          </button>
        </footer>
      </section>
    </div>
  )
}
