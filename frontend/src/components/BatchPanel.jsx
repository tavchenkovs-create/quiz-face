import { useState, useRef, useEffect } from 'react'
import { uploadBatch, getProgressUrl } from '../api'

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

export default function BatchPanel({ onRefresh }) {
  const [pasteText, setPasteText]       = useState('')
  const [items, setItems]               = useState([])
  const [parsed, setParsed]             = useState(false)
  const [running, setRunning]           = useState(false)
  const [overallDone, setOverallDone]   = useState(0)
  const [overallTotal, setOverallTotal] = useState(0)
  const [allDone, setAllDone]           = useState(false)
  const [error, setError]               = useState(null)

  const intervalRef = useRef(null)
  const timerRef    = useRef(null)
  const [, setTick] = useState(0)   // forces re-render every second for live loading elapsed

  useEffect(() => () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (timerRef.current)    clearInterval(timerRef.current)
  }, [])

  const handleParse = () => {
    const lines = pasteText.trim().split('\n').filter(l => l.trim())
    const parsed = lines.map(line => {
      const cols = line.split('\t')
      if (cols.length < 3) return { raw: line, parseError: true, status: 'parse_error' }
      const [date, quizName, albumUrl] = cols.map(c => c.trim())
      return { date, quizName, albumUrl, status: 'pending' }
    })
    setItems(parsed)
    setParsed(true)
    setAllDone(false)
    setOverallDone(0)
    setOverallTotal(0)
    setError(null)
  }

  const handleReset = () => {
    setParsed(false)
    setPasteText('')
    setItems([])
    setAllDone(false)
    setError(null)
  }

  const handleUpload = async () => {
    const validItems = items.filter(it => !it.parseError)
    if (!validItems.length) return

    setRunning(true)
    setAllDone(false)
    setError(null)
    setItems(prev => prev.map(it => it.parseError ? it : { ...it, status: 'pending', elapsed: undefined, loadingStart: undefined }))

    try {
      const data = await uploadBatch(validItems.map(it => ({
        quiz_name: it.quizName,
        game_date: it.date,
        album_url: it.albumUrl,
      })))
      onRefresh()

      const taskId = data.task_id
      let failures = 0

      timerRef.current = setInterval(() => setTick(t => t + 1), 1000)

      const stopAll = () => {
        clearInterval(intervalRef.current); intervalRef.current = null
        clearInterval(timerRef.current);    timerRef.current    = null
      }

      intervalRef.current = setInterval(async () => {
        try {
          const res = await fetch(getProgressUrl(taskId))
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const prog = await res.json()
          failures = 0


          const results      = prog.results      || []
          const currentAlbum = prog.current_album || 0  // 1-based into validItems

          setItems(prev => {
            const next = [...prev]
            let validIdx = 0

            for (let i = 0; i < next.length; i++) {
              if (next[i].parseError) continue

              if (validIdx < results.length) {
                const r = results[validIdx]
                // Only freeze elapsed on the first transition to done/error
                if (next[i].status !== 'done' && next[i].status !== 'error') {
                  const elapsed = next[i].loadingStart
                    ? Math.round((Date.now() - next[i].loadingStart) / 1000)
                    : 0
                  next[i] = { ...next[i], status: r.status, result: r, elapsed }
                }
              } else if (currentAlbum > 0 && validIdx === currentAlbum - 1) {
                next[i] = {
                  ...next[i],
                  status:        'loading',
                  loadingStart:  next[i].loadingStart ?? Date.now(),
                  currentFaces:  prog.current_faces  || 0,
                  currentPhotos: prog.current_photos || 0,
                }
              } else {
                next[i] = { ...next[i], status: 'pending' }
              }

              validIdx++
            }

            return next
          })

          setOverallDone(results.length)
          setOverallTotal(prog.total_albums || validItems.length)

          if (prog.done) {
            stopAll()
            setRunning(false)
            setAllDone(true)
            onRefresh()
          }
        } catch {
          failures++
          if (failures >= 10) {
            stopAll()
            setError('Потеряно соединение с сервером')
            setRunning(false)
          }
        }
      }, 3000)
    } catch (err) {
      setError(err.message)
      setRunning(false)
    }
  }

  const validCount = items.filter(it => !it.parseError).length
  const parseErrCount = items.filter(it => it.parseError).length

  return (
    <div>
      {error && (
        <div className="error-banner" role="alert">
          <span className="error-banner__msg">{error}</span>
          <button type="button" className="error-banner__close" onClick={() => setError(null)}>×</button>
        </div>
      )}

      {!parsed ? (
        <div className="form-group">
          <label className="form-label">Вставьте данные из Google Sheets</label>
          <p className="batch-hint">
            Скопируйте и вставьте три столбца:<br />
            <strong>дата&nbsp;&nbsp;|&nbsp;&nbsp;название игры&nbsp;&nbsp;|&nbsp;&nbsp;ссылка на альбом ВК</strong>
          </p>
          <textarea
            className="form-textarea"
            rows={8}
            placeholder={"2026-01-15\tКвиз, плиз! #1270\thttps://vk.com/album-...\n2026-01-22\tКвиз, плиз! #1271\thttps://vk.com/album-..."}
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
          />
          <button
            type="button"
            className="btn-parse"
            disabled={!pasteText.trim()}
            onClick={handleParse}
          >
            Разобрать
          </button>
        </div>
      ) : (
        <>
          {running && (
            <div className="batch-progress">
              Обработано альбомов: {overallDone} из {overallTotal}
            </div>
          )}

          {allDone && (
            <div className="upload-success" role="status">
              <span aria-hidden="true">✓</span>
              Пакетная загрузка завершена — обработано {overallDone} альбомов.
            </div>
          )}

          <table className="batch-table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Название игры</th>
                <th>Ссылка</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr
                  key={idx}
                  className={
                    item.parseError     ? 'batch-row--error'  :
                    item.status === 'loading' ? 'batch-row--active' : ''
                  }
                >
                  {item.parseError ? (
                    <td colSpan={3} className="batch-cell--raw">{item.raw}</td>
                  ) : (
                    <>
                      <td>{item.date}</td>
                      <td>{item.quizName}</td>
                      <td className="batch-cell--url">
                        <a href={item.albumUrl} target="_blank" rel="noreferrer">{item.albumUrl}</a>
                      </td>
                    </>
                  )}
                  <td><BatchStatus item={item} /></td>
                </tr>
              ))}
            </tbody>
          </table>

          {parseErrCount > 0 && (
            <p className="batch-hint batch-hint--warn">
              {parseErrCount} строк не удалось разобрать — они будут пропущены.
            </p>
          )}

          <div className="batch-actions">
            {!running && (
              <button type="button" className="btn-parse" onClick={handleReset}>
                ← Изменить
              </button>
            )}
            {!allDone && (
              <button
                type="button"
                className="btn-submit"
                style={{ flex: 1 }}
                disabled={running || validCount === 0}
                onClick={handleUpload}
              >
                {running
                  ? <><span className="spinner" aria-hidden="true" /> Загружаем…</>
                  : `Загрузить всё (${validCount} альбомов)`
                }
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function BatchStatus({ item }) {
  if (item.parseError) return <span className="batch-status batch-status--error">Ошибка формата</span>
  switch (item.status) {
    case 'pending':
      return <span className="batch-status batch-status--muted">Ожидает</span>
    case 'loading': {
      const liveElapsed = item.loadingStart
        ? Math.round((Date.now() - item.loadingStart) / 1000)
        : 0
      return (
        <span className="batch-status batch-status--active">
          Загружается… {fmtTime(liveElapsed)} ({item.currentPhotos} фото, {item.currentFaces} лиц)
        </span>
      )
    }
    case 'done':
      return (
        <span className="batch-status batch-status--done">
          Готово ({item.result.faces} лиц за {fmtTime(item.elapsed ?? 0)})
        </span>
      )
    case 'error':
      return (
        <span className="batch-status batch-status--error">
          Ошибка{item.result?.error ? `: ${item.result.error}` : ''}
        </span>
      )
    default:
      return <span className="batch-status batch-status--muted">Ожидает</span>
  }
}
