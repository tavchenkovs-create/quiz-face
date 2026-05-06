const BASE_URL = import.meta.env.VITE_API_URL || ''

function formatDate(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('ru-RU', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

export default function CheatCard({ match }) {
  const { new_face_image, old_face_image, old_game_date, old_quiz_name } = match

  return (
    <div className="cheat-card">
      {/* Лицо из новой игры */}
      <div className="cheat-face">
        <span className="cheat-face__tag cheat-face__tag--new">Новая игра</span>
        <img
          src={`${BASE_URL}${new_face_image}`}
          alt="Лицо из новой игры"
          className="cheat-face__img"
          onError={e => { e.target.style.opacity = '.4' }}
        />
      </div>

      {/* Стрелка */}
      <div className="cheat-card__arrow" aria-hidden="true">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.5"
          strokeLinecap="round" strokeLinejoin="round">
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </svg>
      </div>

      {/* Лицо из старой игры */}
      <div className="cheat-face">
        <span className="cheat-face__tag cheat-face__tag--old">Прошлая игра</span>
        <img
          src={`${BASE_URL}${old_face_image}`}
          alt="Лицо из прошлой игры"
          className="cheat-face__img"
          onError={e => { e.target.style.opacity = '.4' }}
        />
        <span className="cheat-face__label">
          {old_quiz_name}<br />{formatDate(old_game_date)}
        </span>
      </div>

      <span className="cheat-card__badge">Совпадение</span>
    </div>
  )
}
