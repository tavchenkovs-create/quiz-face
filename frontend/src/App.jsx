import { useState, useEffect, useRef } from 'react'
import { fetchQuizzes, uploadPhotos } from './api'
import DropZone from './components/DropZone'
import Results from './components/Results'

export default function App() {
  const [quizzes, setQuizzes]         = useState([])
  const [selectedQuiz, setSelectedQuiz] = useState('')
  const [newQuizName, setNewQuizName] = useState('')
  const [gameDate, setGameDate]       = useState('')
  const [files, setFiles]             = useState([])

  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const [results, setResults] = useState(null)

  const resultsRef = useRef(null)

  useEffect(() => {
    fetchQuizzes()
      .then(setQuizzes)
      .catch(err => setError(err.message))
  }, [])

  useEffect(() => {
    if (results) resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [results])

  const handleSelectChange = (e) => {
    setSelectedQuiz(e.target.value)
    setNewQuizName('')
  }

  const handleNewNameChange = (e) => {
    setNewQuizName(e.target.value)
    setSelectedQuiz('')
  }

  const effectiveQuizName = newQuizName.trim() || selectedQuiz

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    if (!effectiveQuizName) { setError('Укажите название квиза'); return }
    if (!gameDate)           { setError('Укажите дату игры'); return }
    if (files.length === 0)  { setError('Добавьте хотя бы одну фотографию'); return }

    setLoading(true)
    setResults(null)
    try {
      const data = await uploadPhotos({ files, quizName: effectiveQuizName, gameDate })
      setResults(data)
      // refresh quiz list in case a new quiz was created
      fetchQuizzes().then(setQuizzes).catch(() => {})
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <header className="app-header">
        <span className="app-header__logo">🔍</span>
        <span className="app-header__title">Quiz Face</span>
        <span className="app-header__sub">Детектор читеров</span>
      </header>

      <main className="app-main">
        {error && (
          <div className="error-banner" role="alert">
            <span className="error-banner__msg">{error}</span>
            <button className="error-banner__close" onClick={() => setError(null)} aria-label="Закрыть">×</button>
          </div>
        )}

        {/* ── Секция 1: Загрузка ── */}
        <div className="card">
          <p className="card__title">Загрузка фотографий</p>

          <form onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label className="form-label">Название квиза</label>
              <div className="quiz-row">
                <select
                  className="form-select"
                  value={selectedQuiz}
                  onChange={handleSelectChange}
                >
                  <option value="">— Выберите квиз —</option>
                  {quizzes.map(q => (
                    <option key={q.id} value={q.name}>{q.name}</option>
                  ))}
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
              <label className="form-label">Фотографии</label>
              <DropZone files={files} onFilesChange={setFiles} />
            </div>

            <button type="submit" className="btn-submit" disabled={loading}>
              {loading ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  Анализируем фотографии…
                </>
              ) : (
                'Проверить на читеров'
              )}
            </button>
          </form>
        </div>

        {/* ── Секция 2: Результаты ── */}
        {results && (
          <section className="results-section" ref={resultsRef}>
            <Results data={results} />
          </section>
        )}
      </main>
    </div>
  )
}
