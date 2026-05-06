import { useState, useRef, useMemo, useEffect } from 'react'

export default function DropZone({ files, onFilesChange }) {
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef(null)

  // Create object URLs for previews; revoke stale ones on change
  const previews = useMemo(() => files.map(f => URL.createObjectURL(f)), [files])
  useEffect(() => () => previews.forEach(URL.revokeObjectURL), [previews])

  const addFiles = (incoming) => {
    const images = Array.from(incoming).filter(f => f.type.startsWith('image/'))
    onFilesChange(prev => {
      const seen = new Set(prev.map(f => `${f.name}|${f.size}`))
      return [...prev, ...images.filter(f => !seen.has(`${f.name}|${f.size}`))]
    })
  }

  const removeFile = (idx) => onFilesChange(prev => prev.filter((_, i) => i !== idx))

  const onDragOver  = (e) => { e.preventDefault(); setIsDragging(true) }
  const onDragLeave = (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setIsDragging(false) }
  const onDrop      = (e) => { e.preventDefault(); setIsDragging(false); addFiles(e.dataTransfer.files) }
  const onClick     = () => inputRef.current?.click()

  return (
    <div>
      <div
        className={`dropzone${isDragging ? ' dropzone--active' : ''}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={onClick}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && onClick()}
        aria-label="Зона загрузки фотографий"
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*"
          style={{ display: 'none' }}
          tabIndex={-1}
          onChange={e => { addFiles(e.target.files); e.target.value = '' }}
        />

        {/* Upload icon */}
        <svg
          className="dropzone__icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>

        <p className="dropzone__text">
          <strong>Нажмите</strong> или перетащите фотографии сюда
        </p>
        <p className="dropzone__hint">JPEG, PNG, WebP — можно несколько файлов</p>
      </div>

      {files.length > 0 && (
        <div className="photo-grid" role="list" aria-label="Выбранные фотографии">
          {files.map((file, i) => (
            <div key={`${file.name}|${file.size}`} className="photo-grid__item" role="listitem">
              <img
                src={previews[i]}
                alt={file.name}
                className="photo-grid__thumb"
              />
              <button
                type="button"
                className="photo-grid__remove"
                onClick={e => { e.stopPropagation(); removeFile(i) }}
                aria-label={`Удалить ${file.name}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
