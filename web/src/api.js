// Tries MAIN (Kaggle tunnel URL saved in Settings) first, falls back to this server (LITE). Same contract as ui.py.
const KEY = 'satquery.main'
const TOKEN_KEY = 'satquery.token' // MAIN access token, printed by the Kaggle notebook next to the URL
const load = k => { try { return localStorage.getItem(k) || '' } catch { return '' } }
const store = (k, v) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } }
export const getMain = () => load(KEY)
export const getToken = () => load(TOKEN_KEY)
export function setMain(url, token = '') {
  url = url.trim().replace(/\/+$/, '')
  // https only (the token rides along); plain http just for a MAIN on this machine
  if (url && !/^(https:\/\/[^\s/]+|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/i.test(url)) throw new InputError('MAIN URL must look like https://xxxx.trycloudflare.com')
  store(KEY, url)
  store(TOKEN_KEY, token.trim())
}

export class InputError extends Error {}

async function post(base, form, headers) {
  const r = await fetch(`${base}/query`, { method: 'POST', body: form, headers })
  // 401/413/422 are answers, not outages: show them instead of silently falling back to LITE
  if ([401, 413, 422].includes(r.status)) {
    const text = await r.text()
    let detail = text
    try { detail = JSON.parse(text).detail ?? text } catch { /* plain-text body */ }
    throw new InputError(r.status === 401 ? `MAIN refused the request: ${detail}` : String(detail))
  }
  if (!r.ok) throw new Error(`Server error ${r.status}`)
  return r.json()
}

export async function ask(form) {
  const main = getMain()
  if (main) {
    try { return { res: await post(main, form, { 'X-SatQuery-Token': getToken() }), served: 'MAIN' } }
    catch (e) { if (e instanceof InputError) throw e } // MAIN down -> LITE
  }
  return { res: await post('', form), served: 'LITE' }
}

export async function health() {
  const main = getMain()
  for (const [base, served] of [[main, 'MAIN'], ['', 'LITE']]) {
    if (served === 'MAIN' && !main) continue
    try {
      const r = await fetch(`${base}/health`, { signal: AbortSignal.timeout(4000) })
      if (r.ok) return { ...(await r.json()), served }
    } catch { /* try next */ }
  }
  return null
}
