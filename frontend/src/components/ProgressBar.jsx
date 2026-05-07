export default function ProgressBar({ processed, total, facesFound, elapsed, fmtTime, label = 'Обработано фото' }) {
  const pct = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0

  return (
    <div className="progress-wrap">
      <div className="progress-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="progress-bar__fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="progress-text">
        {label}: {processed} из {total > 0 ? total : '…'} &bull; Найдено лиц: {facesFound}
      </p>
      {fmtTime && <p className="progress-text">Время обработки: {fmtTime(elapsed)}</p>}
    </div>
  )
}
