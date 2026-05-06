import CheatCard from './CheatCard'

export default function Results({ data }) {
  const { total_faces_found, cheaters } = data

  if (cheaters.length === 0) {
    return (
      <div className="results-clean" role="status">
        <span className="results-clean__icon" aria-hidden="true">✓</span>
        <div>
          Читеров не обнаружено
          <span className="results-clean__sub">
            Проверено лиц: {total_faces_found}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="results-header">
        <h2 className="results-header__h2">
          Обнаружены читеры: {cheaters.length}
        </h2>
        <span className="results-header__meta">
          Проверено лиц: {total_faces_found}
        </span>
      </div>

      {cheaters.map((match, i) => (
        <CheatCard key={i} match={match} />
      ))}
    </div>
  )
}
