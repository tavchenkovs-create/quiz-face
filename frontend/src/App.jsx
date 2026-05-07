import { useState, useEffect } from 'react'
import { fetchQuizzes } from './api'
import UploadTab from './components/UploadTab'
import DatabaseTab from './components/DatabaseTab'
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

  const tabs = [
    { id: 'upload',   label: 'База' },
    { id: 'database', label: 'База данных' },
    { id: 'check',    label: 'Проверка' },
  ]

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
            {tabs.map(t => (
              <button
                key={t.id}
                role="tab"
                aria-selected={activeTab === t.id}
                className={`tab${activeTab === t.id ? ' tab--active' : ''}`}
                onClick={() => setActiveTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {activeTab === 'upload'   && <UploadTab quizzes={quizzes} onRefresh={refreshQuizzes} />}
          {activeTab === 'database' && <DatabaseTab onRefresh={refreshQuizzes} />}
          {activeTab === 'check'    && <CheckTab quizzes={quizzes} />}
        </div>
      </main>
    </div>
  )
}
