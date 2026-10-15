/* Same-origin & cross-origin API client; identity stays in the server session. */
window.VolnaAPI = {
  async request(path, options = {}) {
    const response = await fetch(path, { credentials: 'include', ...options });
    let data;
    try { data = await response.json(); }
    catch { data = { error: 'Сервер вернул неожиданный ответ' }; }
    if (!response.ok) {
      const error = new Error(data.error || data.detail || 'Не удалось выполнить запрос');
      error.status = response.status;
      throw error;
    }
    return data;
  },
  post(path, data = {}) {
    return this.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
  }
};
