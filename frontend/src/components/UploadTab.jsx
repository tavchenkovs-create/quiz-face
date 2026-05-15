import { useState, useRef, useEffect } from 'react'
import { uploadPhotos, uploadFromVk, getProgressUrl } from '../api'
import DropZone from './DropZone'
import ProgressBar from './ProgressBar'
import BatchPanel from './BatchPanel'

export default function UploadTab({ quizzes, onRefresh }) {
  const [mode, setMode] = useState('single')  // 'single' | 'batch'

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

  const intervalRef  = useRef(null)
  const timerRef     = useRef(null)
  const taskIdRef    = useRef(null)
  const secondsRef   = useRef(0)
  const [elapsed, setElapsed] = useState(0)
  const [checkingResult, setCheckingResult] = useState(false)

  // Clean up both intervals on unmount
  useEffect(() => () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (timerRef.current)    clearInterval(timerRef.current)
  }, [])

  const isProcessing = progress !== null

  const handleSelectChange  = (e) => { setSelectedQuiz(e.target.value); setNewQuizName('') }
  const handleNewNameChange = (e) => { setNewQuizName(e.target.value); setSelectedQuiz('') }
  const effectiveQuizName   = newQuizName.trim() || selectedQuiz

  const handleSourceChange = (val) => { setSource(val); setError(null); setSaved(null) }

  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  const startPolling = (taskId) => {
    taskIdRef.current  = taskId
    secondsRef.current = 0
    setProgress({ processed: 0, total: 0, facesFound: 0 })
    setElapsed(0)
    let failures = 0
    let seconds = 0

    timerRef.current = setInterval(() => {
      seconds += 1
      secondsRef.current = seconds
      setElapsed(seconds)
    }, 1000)

    const stopAll = () => {
      clearInterval(intervalRef.current); intervalRef.current = null
      clearInterval(timerRef.current);    timerRef.current    = null
    }

    intervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(getProgressUrl(taskId))
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        failures = 0

        setProgress({
          processed:  data.processed,
          total:      data.total,
          facesFound: data.faces_found,
        })

        if (data.error) {
          stopAll()
          setError(data.error)
          setProgress(null)
          return
        }

        if (data.done) {
          stopAll()
          setSaved({ total_faces_found: data.faces_found, total_photos: data.total_photos ?? data.total, elapsed: seconds })
          setProgress(null)
        }
      } catch {
        failures += 1
        if (failures >= 20) {
          stopAll()
          setError('Потеряно соединение с сервером во время обработки')
          setProgress(null)
        }
      }
    }, 4000)
  }

  const handleCheckResult = async () => {
    if (!taskIdRef.current) return
    setCheckingResult(true)
    try {
      const res = await fetch(getProgressUrl(taskIdRef.current))
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (data.done) {
        setSaved({ total_faces_found: data.faces_found, total_photos: data.total_photos ?? data.total, elapsed: secondsRef.current })
        setError(null)
      }
    } catch {
      // keep error shown if check also fails
    } finally {
      setCheckingResult(false)
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
      startPolling(data.task_id)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="source-toggle" role="group" aria-label="Режим загрузки" style={{ marginBottom: '1.5rem' }}>
        <button
          type="button"
          className={`source-toggle__btn${mode === 'single' ? ' source-toggle__btn--active' : ''}`}
          onClick={() => setMode('single')}
        >
          Один альбом
        </button>
        <button
          type="button"
          className={`source-toggle__btn${mode === 'batch' ? ' source-toggle__btn--active' : ''}`}
          onClick={() => setMode('batch')}
        >
          Несколько альбомов
        </button>
      </div>

      {mode === 'batch' && <BatchPanel onRefresh={onRefresh} />}

      {mode === 'single' && <form onSubmit={handleSubmit} noValidate>
      {error && (
        <div className="error-banner" role="alert">
          <span className="error-banner__msg">{error}</span>
          {taskIdRef.current && (
            <button
              type="button"
              className="error-banner__check"
              onClick={handleCheckResult}
              disabled={checkingResult}
            >
              {checkingResult ? 'Проверяем…' : 'Проверить результат'}
            </button>
          )}
          <button type="button" className="error-banner__close" onClick={() => setError(null)}>×</button>
        </div>
      )}

      {saved && (
        <div className="upload-success" role="status">
          <span aria-hidden="true">✓</span>
          Сохранено. Найдено лиц: {saved.total_faces_found}
          {saved.total_photos != null && ` (из ${saved.total_photos} фото)`}
          {saved.elapsed != null && ` за ${fmtTime(saved.elapsed)}`}
        </div>
      )}

      {isProcessing && (
        <ProgressBar
          processed={progress.processed}
          total={progress.total}
          facesFound={progress.facesFound}
          elapsed={elapsed}
          fmtTime={fmtTime}
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
      </form>}
    </div>
  )
}
