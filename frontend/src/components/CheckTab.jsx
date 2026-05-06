import { useState, useRef, useEffect } from 'react'
import { checkPhotos } from '../api'
import DropZone from './DropZone'
import Results from './Results'

export default function CheckTab({ quizzes }) {
  const [selectedQuiz, setSelectedQuiz] = useState('')
  const [files, setFiles]               = useState([])
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState(null)
  const [checkResult, setCheckResult]   = useState(null)
  const resultsRef = useRef(null)

  useEffect(() => {
    if (checkResult) resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [checkResult])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setCheckResult(null)

    if (!selectedQuiz) { setError('Выберите квиз из списка'); return }
    if (!files.length)  { setError('Добавьте хотя бы одну фотографию'); return }

    setLoading(true)
    try {
      const data = await checkPhotos({ files, quizName: selectedQuiz })
      setCheckResult(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

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
          <label className="form-label">Фотографии для проверки</label>
          <DropZone files={files} onFilesChange={setFiles} />
        </div>

        <button type="submit" className="btn-submit" disabled={loading}>
          {loading
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
