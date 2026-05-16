import { useState, useRef, useEffect } from 'react'
import { checkPhotos, checkFromVk, getProgressUrl, getAuthHeaders } from '../api'
import DropZone from './DropZone'
import ProgressBar from './ProgressBar'
import Results from './Results'

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

export default function CheckTab({ quizzes }) {
  const [selectedQuiz, setSelectedQuiz] = useState('')
  const [source, setSource]             = useState('files')  // 'files' | 'vk'
  const [files, setFiles]               = useState([])
  const [vkUrl, setVkUrl]               = useState('')
  const [tolerance, setTolerance]       = useState(0.45)

  const [loading, setLoading]       = useState(false)
  const [progress, setProgress]     = useState(null)   // {processed, total, facesFound}
  const [elapsed, setElapsed]       = useState(0)
  const [error, setError]           = useState(null)
  const [checkResult, setCheckResult] = useState(null)

  const intervalRef = useRef(null)
  const timerRef    = useRef(null)
  const resultsRef  = useRef(null)

  const isProcessing = progress !== null

  useEffect(() => {
    if (checkResult) resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [checkResult])

  useEffect(() => () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (timerRef.current)    clearInterval(timerRef.current)
  }, [])

  const handleSourceChange = (val) => {
    setSource(val)
    setError(null)
    setCheckResult(null)
  }

  const stopAll = () => {
    clearInterval(intervalRef.current); intervalRef.current = null
    clearInterval(timerRef.current);    timerRef.current    = null
  }

  const startPolling = (taskId) => {
    setProgress({ processed: 0, total: 0, facesFound: 0 })
    setElapsed(0)
    let seconds = 0
    let failures = 0

    timerRef.current = setInterval(() => { seconds++; setElapsed(seconds) }, 1000)

    intervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(getProgressUrl(taskId), { headers: getAuthHeaders() })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        failures = 0

        setProgress({ processed: data.processed, total: data.total, facesFound: data.faces_found })

        if (data.error) {
          stopAll()
          setError(data.error)
          setProgress(null)
          return
        }

        if (data.done) {
          stopAll()
          setProgress(null)
          setCheckResult(data.result)
        }
      } catch {
        failures++
        if (failures >= 3) {
          stopAll()
          setError('Потеряно соединение с сервером во время проверки')
          setProgress(null)
        }
      }
    }, 2000)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setCheckResult(null)

    if (!selectedQuiz) { setError('Выберите квиз из списка'); return }
    if (source === 'files' && !files.length)  { setError('Добавьте хотя бы одну фотографию'); return }
    if (source === 'vk'    && !vkUrl.trim())  { setError('Введите ссылку на альбом ВКонтакте'); return }

    setLoading(true)
    try {
      if (source === 'files') {
        const data = await checkPhotos({ files, quizName: selectedQuiz, tolerance })
        setCheckResult(data)
      } else {
        const data = await checkFromVk({ quizName: selectedQuiz, albumUrl: vkUrl.trim(), tolerance })
        startPolling(data.task_id)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const disabled = loading || isProcessing

  return (
    <>
      <form onSubmit={handleSubmit} noValidate>
        {error && (
          <div className="error-banner" role="alert">
            <span className="error-banner__msg">{error}</span>
            <button type="button" className="error-banner__close" onClick={() => setError(null)}>×</button>
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Название квиза</label>
          <select
            className="form-select"
            value={selectedQuiz}
            onChange={e => setSelectedQuiz(e.target.value)}
            style={{ maxWidth: '360px' }}
          >
            <option value="">— Выберите квиз —</option>
            {quizzes.map(q => <option key={q.id} value={q.name}>{q.name}</option>)}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">
            Строгость проверки: <span className="tolerance-value">{tolerance.toFixed(2)}</span>
          </label>
          <div className="tolerance-wrap">
            <input
              type="range"
              className="tolerance-slider"
              min="0.3"
              max="0.6"
              step="0.05"
              value={tolerance}
              onChange={e => setTolerance(parseFloat(e.target.value))}
            />
            <div className="tolerance-labels">
              <span>Строже</span>
              <span>Мягче</span>
            </div>
          </div>
          <p className="tolerance-hint">
            Меньшее значение — меньше ложных срабатываний, но может пропустить некоторых читеров
          </p>
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

        {isProcessing && (
          <ProgressBar
            processed={progress.processed}
            total={progress.total}
            facesFound={progress.facesFound}
            elapsed={elapsed}
            fmtTime={fmtTime}
            label="Проверено фото"
          />
        )}

        <button type="submit" className="btn-submit" disabled={disabled}>
          {loading
            ? <><span className="spinner" aria-hidden="true" /> Отправляем…</>
            : isProcessing
              ? <><span className="spinner" aria-hidden="true" /> Анализируем…</>
              : 'Проверить на читеров'
          }
        </button>
      </form>

      {checkResult && (
        <section className="results-section" ref={resultsRef}>
          <Results data={checkResult} />
        </section>
      )}
    </>
  )
}
