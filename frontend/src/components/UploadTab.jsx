import { useState } from 'react'
import { uploadPhotos } from '../api'
import DropZone from './DropZone'

export default function UploadTab({ quizzes, onRefresh }) {
  const [selectedQuiz, setSelectedQuiz] = useState('')
  const [newQuizName, setNewQuizName] = useState('')
  const [gameDate, setGameDate]       = useState('')
  const [files, setFiles]             = useState([])
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState(null)
  const [saved, setSaved]             = useState(null)  // { total_faces_found }

  const handleSelectChange  = (e) => { setSelectedQuiz(e.target.value); setNewQuizName('') }
  const handleNewNameChange = (e) => { setNewQuizName(e.target.value); setSelectedQuiz('') }
  const effectiveQuizName   = newQuizName.trim() || selectedQuiz

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setSaved(null)

    if (!effectiveQuizName) { setError('Укажите название квиза'); return }
    if (!gameDate)           { setError('Укажите дату игры'); return }
    if (!files.length)       { setError('Добавьте хотя бы одну фотографию'); return }

    setLoading(true)
    try {
      const data = await uploadPhotos({ files, quizName: effectiveQuizName, gameDate })
      setSaved(data)
      setFiles([])
      onRefresh()
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
        </div>
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
        <label className="form-label">Фотографии</label>
        <DropZone files={files} onFilesChange={setFiles} />
      </div>

      <button type="submit" className="btn-submit" disabled={loading}>
        {loading
          ? <><span className="spinner" aria-hidden="true" /> Сохраняем…</>
          : 'Сохранить в базу'
        }
      </button>
    </form>
  )
}
