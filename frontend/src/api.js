const BASE_URL = import.meta.env.VITE_API_URL || ''

export async function fetchQuizzes() {
  const res = await fetch(`${BASE_URL}/quizzes`)
  if (!res.ok) throw new Error(`Не удалось загрузить список квизов (${res.status})`)
  return res.json()
}

// Returns { task_id }
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

// Returns { task_id }
export async function uploadFromVk({ quizName, gameDate, albumUrl }) {
  const res = await fetch(`${BASE_URL}/upload-from-vk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quiz_name: quizName, game_date: gameDate, album_url: albumUrl }),
  })
  if (!res.ok) {
    let detail = `Ошибка сервера (${res.status})`
    try { const b = await res.json(); if (b.detail) detail = b.detail } catch (_) {}
    throw new Error(detail)
  }
  return res.json()
}

// Returns { task_id }
export async function checkFromVk({ quizName, albumUrl }) {
  const res = await fetch(`${BASE_URL}/check-from-vk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quiz_name: quizName, album_url: albumUrl }),
  })
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

export async function fetchStats() {
  const res = await fetch(`${BASE_URL}/stats`)
  if (!res.ok) throw new Error(`Не удалось загрузить статистику (${res.status})`)
  return res.json()
}

export async function fetchDatabase() {
  const res = await fetch(`${BASE_URL}/database`)
  if (!res.ok) throw new Error(`Не удалось загрузить базу данных (${res.status})`)
  return res.json()
}

export async function deleteGame(gameId) {
  const res = await fetch(`${BASE_URL}/games/${gameId}`, { method: 'DELETE' })
  if (!res.ok) {
    let detail = `Ошибка сервера (${res.status})`
    try { const b = await res.json(); if (b.detail) detail = b.detail } catch (_) {}
    throw new Error(detail)
  }
  return res.json()
}

// Returns { task_id }
export async function uploadBatch(items) {
  const res = await fetch(`${BASE_URL}/upload-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  })
  if (!res.ok) {
    let detail = `Ошибка сервера (${res.status})`
    try { const b = await res.json(); if (b.detail) detail = b.detail } catch (_) {}
    throw new Error(detail)
  }
  return res.json()
}

export function getProgressUrl(taskId) {
  return `${BASE_URL}/progress/${taskId}`
}
