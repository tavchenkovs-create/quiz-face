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
    try { const b = await res.json(); if (b.detail) detail = b.detail } catch (_) {}
    throw new Error(detail)
  }
  return res.json()
}

export async function checkPhotos({ files, quizName }) {
  const form = new FormData()
  form.append('quiz_name', quizName)
  for (const file of files) form.append('files', file)

  const res = await fetch(`${BASE_URL}/check`, { method: 'POST', body: form })
  if (!res.ok) {
    let detail = `Ошибка сервера (${res.status})`
    try { const b = await res.json(); if (b.detail) detail = b.detail } catch (_) {}
    throw new Error(detail)
  }
  return res.json()
}
