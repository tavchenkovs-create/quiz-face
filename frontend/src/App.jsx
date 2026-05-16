import { useState, useEffect } from 'react'
import { fetchQuizzes, login } from './api'
import UploadTab from './components/UploadTab'
import DatabaseTab from './components/DatabaseTab'
import CheckTab from './components/CheckTab'

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('auth_token'))

  const [activeTab, setActiveTab] = useState('upload')
  const [quizzes, setQuizzes] = useState([])
  const [error, setError] = useState(null)

  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState(null)
  const [loginLoading, setLoginLoading] = useState(false)

  const refreshQuizzes = () =>
    fetchQuizzes()
      .then(setQuizzes)
      .catch(e => setError(e.message))

  useEffect(() => {
    if (token) refreshQuizzes()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoginError(null)
    setLoginLoading(true)
    try {
      const data = await login(password)
      localStorage.setItem('auth_token', data.token)
      setToken(data.token)
      setPassword('')
    } catch (err) {
      setLoginError(err.message)
    } finally {
      setLoginLoading(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('auth_token')
    setToken(null)
  }

  if (!token) {
    return (
      <div className="login-screen">
        <form className="login-card" onSubmit={handleLogin} noValidate>
          <div className="login-logo">🔍</div>
          <h1 className="login-title">Quiz Face</h1>
          {loginError && <p className="login-error">{loginError}</p>}
          <input
            type="password"
            className="form-input"
            placeholder="Пароль"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoFocus
          />
          <button type="submit" className="btn-submit" disabled={loginLoading}>
            {loginLoading
              ? <><span className="spinner" aria-hidden="true" /> Входим…</>
              : 'Войти'
            }
          </button>
        </form>
      </div>
    )
  }

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
        <button type="button" className="btn-logout" onClick={handleLogout}>Выйти</button>
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
