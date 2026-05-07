import { useState, useEffect } from 'react'
import { fetchStats, fetchDatabase, deleteGame } from '../api'

export default function DatabaseTab({ onRefresh }) {
  const [stats, setStats]     = useState(null)
  const [quizzes, setQuizzes] = useState([])
  const [open, setOpen]       = useState(new Set())
  const [error, setError]     = useState(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const [s, q] = await Promise.all([fetchStats(), fetchDatabase()])
      setStats(s)
      setQuizzes(q)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const toggleQuiz = (id) =>
    setOpen(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const handleDelete = async (game, quizName) => {
    if (!window.confirm(
      `Удалить игру «${quizName}» от ${game.date}? Это удалит ${game.face_count} лиц из базы.`
    )) return

    try {
      await deleteGame(game.game_id)
      onRefresh()
      await load()
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div>
      {error && (
        <div className="error-banner" role="alert">
          <span className="error-banner__msg">{error}</span>
          <button type="button" className="error-banner__close" onClick={() => setError(null)}>×</button>
        </div>
      )}

      {loading ? (
        <p className="db-loading">Загрузка…</p>
      ) : (
        <>
          {stats && (
            <div className="db-stats">
              <div className="db-stat">
                <span className="db-stat__value">{stats.total_quizzes}</span>
                <span className="db-stat__label">Квизов в базе</span>
              </div>
              <div className="db-stat">
                <span className="db-stat__value">{stats.total_games}</span>
                <span className="db-stat__label">Игр (дат) в базе</span>
              </div>
              <div className="db-stat">
                <span className="db-stat__value">{stats.total_faces}</span>
                <span className="db-stat__label">Лиц в базе</span>
              </div>
            </div>
          )}

          {quizzes.length === 0 ? (
            <p className="db-empty">База данных пуста</p>
          ) : (
            <div className="accordion">
              {quizzes.map(quiz => (
                <div key={quiz.quiz_id} className="accordion__item">
                  <button
                    type="button"
                    className={`accordion__head${open.has(quiz.quiz_id) ? ' accordion__head--open' : ''}`}
                    onClick={() => toggleQuiz(quiz.quiz_id)}
                  >
                    <span className="accordion__title">{quiz.quiz_name}</span>
                    <span className="accordion__meta">{quiz.games.length} дат</span>
                    <span className="accordion__chevron" aria-hidden="true">▾</span>
                  </button>

                  {open.has(quiz.quiz_id) && (
                    <div className="accordion__body">
                      {quiz.games.map(game => (
                        <div key={game.game_id} className="db-game-row">
                          <span className="db-game-row__date">{game.date}</span>
                          <span className="db-game-row__faces">{game.face_count} лиц</span>
                          <button
                            type="button"
                            className="db-game-row__delete"
                            title="Удалить игру"
                            onClick={() => handleDelete(game, quiz.quiz_name)}
                          >
                            🗑
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
