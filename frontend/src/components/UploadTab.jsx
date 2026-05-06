import { useState } from 'react'
import { uploadPhotos, uploadFromVk } from '../api'
import DropZone from './DropZone'

export default function UploadTab({ quizzes, onRefresh }) {
  const [selectedQuiz, setSelectedQuiz] = useState('')
  const [newQuizName, setNewQuizName]   = useState('')
  const [gameDate, setGameDate]         = useState('')
  const [source, setSource]             = useState('files')  // 'files' | 'vk'
  const [files, setFiles]               = useState([])
  const [vkUrl, setVkUrl]               = useState('')
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState(null)
  const [saved, setSaved]               = useState(null)

  const handleSelectChange  = (e) => { setSelectedQuiz(e.target.value); setNewQuizName('') }
  const handleNewNameChange = (e) => { setNewQuizName(e.target.value); setSelectedQuiz('') }
  const effectiveQuizName   = newQuizName.trim() || selectedQuiz

  const handleSourceChange = (val) => {
    setSource(val)
    setError(null)
    setSaved(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setSaved(null)

    if (!effectiveQuizName) { setError('Укажите название квиза'); return }
    if (!gameDate)           { setError('Укажите дату игры'); return }

    if (source === 'files') {
      if (!files.length) { setError('Добавьте хотя бы одну фотографию'); return }
    } else {
      if (!vkUrl.trim()) { setError('Введите ссылку на альбом ВКонтакте'); return }
    }

    setLoading(true)
    try {
      let data
      if (source === 'files') {
        data = await uploadPhotos({ files, quizName: effectiveQuizName, gameDate })
        setFiles([])
      } else {
        data = await uploadFromVk({ quizName: effectiveQuizName, gameDate, albumUrl: vkUrl.trim() })
      }
      setSaved(data)
      onRefresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const loadingText = source === 'vk' ? 'Загружаем из ВКонтакте…' : 'Сохраняем…'

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
          {saved.total_photos != null && ` (из ${saved.total_photos} фото)`}
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

      <button type="submit" className="btn-submit" disabled={loading}>
        {loading
          ? <><span className="spinner" aria-hidden="true" /> {loadingText}</>
          : 'Сохранить в базу'
        }
      </button>
    </form>
  )
}
