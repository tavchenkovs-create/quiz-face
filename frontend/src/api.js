const BASE_URL = import.meta.env.VITE_API_URL || ''

export async function fetchQuizzes() {
  const res = await fetch(`${BASE_URL}/quizzes`)
  if (!res.ok) throw new Error(`Не удалось загрузить список квизов (${res.status})`)
  return res.json()
}

export async function uploadPhotos({ files, quizName, gameDate }) {
  const form = new FormData()
  form.append('quiz_name', quizName)
  form.append('game_date', gameDate)
  for (const file of files) form.append('files', file)

  const res = await fetch(`${BASE_URL}/upload`, { method: 'POST', body: form })

  if (!res.ok) {
    let detail = `Ошибка сервера (${res.status})`
    try {
      const body = await res.json()
      if (body.detail) detail = body.detail
    } catch (_) {}
    throw new Error(detail)
  }

  return res.json()
}
