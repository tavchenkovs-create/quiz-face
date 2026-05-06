import { useState, useEffect } from 'react'
import { fetchQuizzes } from './api'
import UploadTab from './components/UploadTab'
import CheckTab from './components/CheckTab'

export default function App() {
  const [activeTab, setActiveTab] = useState('upload')
  const [quizzes, setQuizzes] = useState([])
  const [error, setError] = useState(null)

  const refreshQuizzes = () =>
    fetchQuizzes()
      .then(setQuizzes)
      .catch(e => setError(e.message))

  useEffect(() => { refreshQuizzes() }, [])

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

        <div className="card">
          <div className="tabs" role="tablist">
            <button
              role="tab"
              aria-selected={activeTab === 'upload'}
              className={`tab${activeTab === 'upload' ? ' tab--active' : ''}`}
              onClick={() => setActiveTab('upload')}
            >
              База
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'check'}
              className={`tab${activeTab === 'check' ? ' tab--active' : ''}`}
              onClick={() => setActiveTab('check')}
            >
              Проверка
            </button>
          </div>

          {activeTab === 'upload'
            ? <UploadTab quizzes={quizzes} onRefresh={refreshQuizzes} />
            : <CheckTab quizzes={quizzes} />
          }
        </div>
      </main>
    </div>
  )
}
