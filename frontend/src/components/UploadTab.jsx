import { useState, useRef, useEffect } from 'react'
import { uploadPhotos, uploadFromVk, getProgressUrl } from '../api'
import DropZone from './DropZone'
import ProgressBar from './ProgressBar'

export default function UploadTab({ quizzes, onRefresh }) {
  const [selectedQuiz, setSelectedQuiz] = useState('')
  const [newQuizName, setNewQuizName]   = useState('')
  const [gameDate, setGameDate]         = useState('')
  const [source, setSource]             = useState('files')  // 'files' | 'vk'
  const [files, setFiles]               = useState([])
  const [vkUrl, setVkUrl]               = useState('')

  const [loading, setLoading]       = useState(false)   // waiting for initial POST
  const [progress, setProgress]     = useState(null)    // { processed, total, facesFound }
  const [saved, setSaved]           = useState(null)    // final result
  const [error, setError]           = useState(null)

  const esRef = useRef(null)

  // Clean up EventSource on unmount
  useEffect(() => () => esRef.current?.close(), [])

  const isProcessing = progress !== null

  const handleSelectChange  = (e) => { setSelectedQuiz(e.target.value); setNewQuizName('') }
  const handleNewNameChange = (e) => { setNewQuizName(e.target.value); setSelectedQuiz('') }
  const effectiveQuizName   = newQuizName.trim() || selectedQuiz

  const handleSourceChange = (val) => { setSource(val); setError(null); setSaved(null) }

  const connectProgress = (taskId) => {
    const es = new EventSource(getProgressUrl(taskId))
    esRef.current = es
    setProgress({ processed: 0, total: 0, facesFound: 0 })

    es.onmessage = (e) => {
      const data = JSON.parse(e.data)

      setProgress({
        processed:  data.processed,
        total:      data.total,
        facesFound: data.faces_found,
      })

      if (data.error) {
        es.close()
        esRef.current = null
        setError(data.error)
        setProgress(null)
        return
      }

      if (data.done) {
        es.close()
        esRef.current = null
        setSaved({ total_faces_found: data.faces_found, total_photos: data.total_photos ?? data.total })
        setProgress(null)
      }
    }

    es.onerror = () => {
      es.close()
      esRef.current = null
      setError('Потеряно соединение с сервером во время обработки')
      setProgress(null)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setSaved(null)

    if (!effectiveQuizName) { setError('Укажите название квиза'); return }
    if (!gameDate)           { setError('Укажите дату игры'); return }
    if (source === 'files' && !files.length) { setError('Добавьте хотя бы одну фотографию'); return }
    if (source === 'vk'    && !vkUrl.trim()) { setError('Введите ссылку на альбом ВКонтакте'); return }

    setLoading(true)
    try {
      let data
      if (source === 'files') {
        data = await uploadPhotos({ files, quizName: effectiveQuizName, gameDate })
        setFiles([])
      } else {
        data = await uploadFromVk({ quizName: effectiveQuizName, gameDate, albumUrl: vkUrl.trim() })
      }
      onRefresh()
      connectProgress(data.task_id)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {error && (
        <div className="error-banner" role="alert">
          <span className="error-banner__msg">{error}</span>
          <button type="button" className="error-banner__close" onClick={() => setError(null)}>×</button>
        </div>
      )}

      {saved && (
        <div className="upload-success" role="status">
          <span aria-hidden="true">✓</span>
          Сохранено. Найдено лиц: {saved.total_faces_found}
          {saved.total_photos != null && ` (из ${saved.total_photos} фото)`}
        </div>
      )}

      {isProcessing && (
        <ProgressBar
          processed={progress.processed}
          total={progress.total}
          facesFound={progress.facesFound}
        />
      )}

      <div className="form-group">
        <label className="form-label">Название квиза</label>
        <div className="quiz-row">
          <select className="form-select" value={selectedQuiz} onChange={handleSelectChange}>
            <option value="">— Выберите квиз —</option>
            {quizzes.map(q => <option key={q.id} value={q.name}>{q.name}</option>)}
          </select>
          <span className="quiz-row__sep">или</span>
          <input
            type="text"
            className="form-input"
            placeholder="Новое название…"
            value={newQuizName}
            onChange={handleNewNameChange}
            maxLength={255}
          />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Дата игры</label>
        <input
          type="date"
          className="form-date"
          value={gameDate}
          onChange={e => setGameDate(e.target.value)}
          style={{ maxWidth: '220px' }}
        />
      </div>

      <div className="form-group">
        <label className="form-label">Источник фотографий</label>
        <div className="source-toggle" role="group" aria-label="Источник фотографий">
          <button
            type="button"
            className={`source-toggle__btn${source === 'files' ? ' source-toggle__btn--active' : ''}`}
            onClick={() => handleSourceChange('files')}
          >
            Загрузить файлы
          </button>
          <button
            type="button"
            className={`source-toggle__btn${source === 'vk' ? ' source-toggle__btn--active' : ''}`}
            onClick={() => handleSourceChange('vk')}
          >
            Загрузить из ВК
          </button>
        </div>

        {source === 'files' ? (
          <DropZone files={files} onFilesChange={setFiles} />
        ) : (
          <input
            type="url"
            className="form-input"
            placeholder="https://vk.com/album-12345_67890"
            value={vkUrl}
            onChange={e => setVkUrl(e.target.value)}
            style={{ marginTop: '.75rem' }}
          />
        )}
      </div>

      <button type="submit" className="btn-submit" disabled={loading || isProcessing}>
        {loading
          ? <><span className="spinner" aria-hidden="true" /> Отправляем…</>
          : isProcessing
            ? <><span className="spinner" aria-hidden="true" /> Обрабатываем…</>
            : 'Сохранить в базу'
        }
      </button>
    </form>
  )
}
