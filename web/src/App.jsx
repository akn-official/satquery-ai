import { useEffect, useRef, useState } from 'react'
import {
  ArrowRight, CaretDown, CheckCircle, DownloadSimple, Gear, Prohibit, WarningCircle, X, XCircle,
} from '@phosphor-icons/react'
import { ask, getMain, getToken, health, InputError, setMain } from './api'

const EXAMPLES = [
  ['Describe the scene', 'Describe the land-cover and major objects visible in this image.'],
  ['Find the water', 'Highlight the water body referred to in the query.'],
  ['What changed', 'What changed between these two dates, and where did the change occur?'],
  ['Fuse optical and SAR', 'Use the optical and SAR images together to identify built-up and water-covered regions.'],
  ['Built-up trend', 'Has the built-up area increased, decreased, or remained unchanged?'],
]
// files live in /samples (synthetic 256 px GeoTIFFs), served by server.py
const SAMPLES = [
  { title: 'Flood, two dates', sensor: 'Cartosat-2S MX, 4 bands, T1 and T2', files: [['cartosat_t1.tif', 'optical'], ['cartosat_t2_flood.tif', 'optical']], q: EXAMPLES[2][1] },
  { title: 'Optical and SAR', sensor: 'Cartosat-2S MX with RISAT backscatter', files: [['cartosat_t1.tif', 'optical'], ['risat_sar.tif', 'sar']], q: EXAMPLES[3][1] },
  { title: 'Single scene', sensor: 'Cartosat-2S MX, 4 bands', files: [['cartosat_t1.tif', 'optical']], q: EXAMPLES[0][1] },
]
const MODS = [['auto', 'Auto'], ['optical', 'Optical'], ['sar', 'SAR']]
const CONFIG_LABEL = { single: 'Single image', optical_sar: 'Optical + SAR', bitemporal: 'Bi-temporal' }
const EMPTY_SLOT = { file: null, mod: 'auto' }

function guessConfig(slots) {
  const f = slots.filter(s => s.file)
  if (!f.length) return null
  if (f.length === 1) return 'Single image'
  const [a, b] = f.map(s => s.mod)
  if (a === 'auto' || b === 'auto') return 'Pair (server detects the type)'
  return a === b ? 'Bi-temporal pair' : 'Optical + SAR pair'
}

const fmtBytes = n => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`)
const pretty = k => k.replace(/_/g, ' ')

function save(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  Object.assign(document.createElement('a'), { href: url, download: name }).click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function App() {
  const [slots, setSlots] = useState([EMPTY_SLOT, EMPTY_SLOT])
  const [query, setQuery] = useState(EXAMPLES[0][1])
  const [params, setParams] = useState('{}')
  const [state, setState] = useState({ phase: 'idle' }) // idle | loading | error | done
  const [status, setStatus] = useState(undefined)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    let alive = true
    const poll = () => health().then(s => alive && setStatus(s))
    poll()
    const id = setInterval(poll, 15000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  const update = (i, patch) => setSlots(s => s.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const ready = slots.some(s => s.file) && query.trim() && state.phase !== 'loading'

  async function loadSample(sample) {
    try {
      const files = await Promise.all(sample.files.map(async ([name, mod]) => {
        const r = await fetch(`/samples/${name}`)
        if (!r.ok) throw new Error(`${name}: ${r.status}`)
        return { file: new File([await r.blob()], name, { type: 'image/tiff' }), mod }
      }))
      setSlots([files[0], files[1] ?? EMPTY_SLOT])
      setQuery(sample.q)
      setState({ phase: 'idle' })
    } catch (e) {
      setState({ phase: 'error', message: `Sample scenes are served by the laptop server only (${e.message}). Drop your own GeoTIFFs instead.` })
    }
  }

  async function run() {
    if (!ready) return
    let p
    try { p = JSON.parse(params || '{}') } catch (e) {
      return setState({ phase: 'error', message: `Tool parameters must be valid JSON: ${e.message}` })
    }
    const picked = slots.filter(s => s.file)
    const form = new FormData()
    form.append('q', query)
    form.append('modalities', picked.map(s => s.mod).join(','))
    form.append('params', JSON.stringify(p))
    picked.forEach(s => form.append('files', s.file, s.file.name))
    setState({ phase: 'loading', started: Date.now() })
    try {
      const { res, served } = await ask(form)
      setState({ phase: 'done', res, served, id: Date.now() })
    } catch (e) {
      setState({ phase: 'error', message: e instanceof InputError ? e.message : `Could not reach the server. ${e.message}` })
    }
  }

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <Header status={status} settingsOpen={settingsOpen} onSettings={() => setSettingsOpen(o => !o)} />
      {settingsOpen && <Settings onClose={() => { setSettingsOpen(false); health().then(setStatus) }} />}

      <div className="grid flex-1 lg:grid-cols-[384px_minmax(0,1fr)]">
        <aside aria-label="Query" className="flex flex-col border-b border-rule bg-sheet lg:sticky lg:top-14 lg:h-[calc(100dvh-3.5rem)] lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <div className="px-5 py-5">
            <h2 className="text-[15px] font-semibold">Imagery</h2>
            <p className="mt-1 text-sm text-ink-2">One scene, an optical + SAR pair, or two dates of one area.</p>
            <div className="mt-4 grid gap-3">
              <Slot index={0} letter="A" hint="Optical, or the earlier date" slot={slots[0]} update={update} />
              <Slot index={1} letter="B" hint="Optional: SAR, or the later date" slot={slots[1]} update={update} />
            </div>
            <p className="mt-3 text-sm text-ink-2">
              Reads as: <span className="font-semibold text-ink">{guessConfig(slots) ?? 'nothing loaded'}</span>
            </p>
          </div>

          <div className="border-t border-rule px-5 py-5">
            <label htmlFor="q" className="text-[15px] font-semibold">Question</label>
            <textarea
              id="q" rows={3} value={query} onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) run() }}
              className="mt-2 block w-full resize-y rounded-[3px] border border-rule-strong bg-paper px-3 py-2.5 leading-relaxed outline-none placeholder:text-ink-3 focus:border-ink"
              placeholder="Is the reservoir larger in the second image?"
            />
            <div className="mt-4 text-sm text-ink-3" id="ex-label">Or try</div>
            <ul className="mt-1 grid" aria-labelledby="ex-label">
              {EXAMPLES.map(([label, q]) => (
                <li key={label}>
                  <button
                    type="button" onClick={() => setQuery(q)} aria-pressed={query === q}
                    className="grid w-full grid-cols-[10px_1fr] items-baseline gap-2.5 py-1.5 text-left text-sm text-ink-2 hover:text-ink aria-pressed:text-ink"
                  >
                    <span className={`size-1.5 -translate-y-px ${query === q ? 'bg-ink' : 'bg-rule-strong'}`} />
                    {label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="border-t border-rule px-5 py-5">
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
                Tool parameters (advanced)
                <CaretDown size={14} className="transition-transform duration-150 group-open:rotate-180" />
              </summary>
              <label htmlFor="params" className="sr-only">Tool parameters JSON</label>
              <input
                id="params" value={params} onChange={e => setParams(e.target.value)} spellCheck={false}
                className="mt-3 w-full rounded-[3px] border border-rule-strong bg-paper px-3 py-2 font-mono text-sm outline-none focus:border-ink"
              />
              <p className="mt-2 font-mono text-[13px] text-ink-3">{'{"water_sar": {"threshold_db": -15}}'}</p>
            </details>
          </div>

          <div className="sticky bottom-0 mt-auto border-t border-rule bg-sheet px-5 py-4">
            <button
              type="button" onClick={run} disabled={!ready}
              className="flex h-12 w-full items-center justify-between rounded-[3px] bg-ink px-4 font-semibold text-paper hover:bg-ink-2 disabled:bg-well disabled:text-ink-3"
            >
              {state.phase === 'loading' ? 'Running…' : 'Run analysis'}
              <span className="flex items-center gap-2 font-mono text-[13px] font-normal opacity-75">
                Ctrl Enter <ArrowRight size={16} weight="bold" />
              </span>
            </button>
          </div>
        </aside>

        <main aria-live="polite" className="min-w-0 px-5 py-8 md:px-10">
          {state.phase === 'idle' && <Empty onSample={loadSample} />}
          {state.phase === 'loading' && <Loading started={state.started} />}
          {state.phase === 'error' && <ErrorBox message={state.message} />}
          {state.phase === 'done' && <Result key={state.id} res={state.res} served={state.served} vlmOnline={status?.vlm_online} />}
        </main>
      </div>
    </div>
  )
}

function Header({ status, settingsOpen, onSettings }) {
  const vlm = status?.vlm_online
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-4 border-b border-rule bg-paper px-5">
      <div className="flex items-baseline gap-3">
        <img src="/favicon.svg" alt="" className="size-6 self-center" />
        <span className="text-[17px] font-bold tracking-tight">SatQuery</span>
        <span className="hidden text-sm text-ink-3 sm:inline">SIH26167 · remote-sensing assistant</span>
      </div>
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-2 text-sm text-ink-2" title={status?.vlm_url}>
          {status === undefined ? 'Checking server…' : status === null ? (
            <><span className="size-2 bg-bad" />Server offline</>
          ) : (
            <>
              <span className={`size-2 ${vlm ? 'bg-ok' : 'bg-warn'}`} />
              <span className="font-semibold text-ink">{status.served}</span>
              <span className="hidden sm:inline">{status.vlm_model} {vlm ? 'online' : 'offline'}</span>
            </>
          )}
        </span>
        <button
          type="button" onClick={onSettings} aria-expanded={settingsOpen}
          className="flex h-9 items-center gap-2 rounded-[3px] border border-rule-strong px-3 text-sm hover:border-ink aria-expanded:bg-well"
        ><Gear size={16} />Server</button>
      </div>
    </header>
  )
}

function Settings({ onClose }) {
  const [url, setUrl] = useState(getMain())
  const [token, setToken] = useState(getToken())
  const [error, setError] = useState('')
  return (
    <form
      onSubmit={e => {
        e.preventDefault()
        try { setMain(url, token); onClose() } catch (err) { setError(err.message) }
      }}
      className="enter flex flex-wrap items-end gap-x-6 gap-y-3 border-b border-rule bg-sheet px-5 py-4"
    >
      <div className="grid min-w-0 flex-1 basis-80 gap-1.5">
        <label htmlFor="main" className="text-sm font-semibold">MAIN server URL</label>
        <input
          id="main" value={url} onChange={e => { setUrl(e.target.value); setError('') }} placeholder="https://xxxx.trycloudflare.com"
          aria-invalid={!!error} aria-describedby={error ? 'main-err' : undefined}
          className="rounded-[3px] border border-rule-strong bg-paper px-3 py-2 font-mono text-sm outline-none focus:border-ink"
        />
        {error && <p id="main-err" className="text-sm text-bad">{error}</p>}
      </div>
      <div className="grid min-w-0 basis-56 gap-1.5">
        <label htmlFor="token" className="text-sm font-semibold">Access token</label>
        <input
          id="token" type="password" value={token} onChange={e => setToken(e.target.value)} autoComplete="off"
          className="rounded-[3px] border border-rule-strong bg-paper px-3 py-2 font-mono text-sm outline-none focus:border-ink"
        />
      </div>
      <p className="max-w-[52ch] flex-1 basis-64 text-sm text-ink-2">
        The Kaggle T4 tunnel and the token the notebook prints with it. Leave the URL empty to run on this laptop (LITE). If MAIN goes down, queries fall back to LITE.
      </p>
      <div className="flex gap-2">
        <button type="button" onClick={onClose} className="h-9 rounded-[3px] px-3 text-sm text-ink-2 hover:text-ink">Cancel</button>
        <button className="h-9 rounded-[3px] bg-ink px-4 text-sm font-semibold text-paper hover:bg-ink-2">Save</button>
      </div>
    </form>
  )
}

function Slot({ index, letter, hint, slot, update }) {
  const input = useRef(null)
  const [drag, setDrag] = useState(false)
  const take = files => files?.[0] && update(index, { file: files[0] })
  const label = `Image ${letter}`

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); take(e.dataTransfer.files) }}
      className={`rounded-[3px] border bg-paper ${drag ? 'border-ink' : slot.file ? 'border-rule-strong' : 'border-dashed border-rule-strong'}`}
    >
      <input
        ref={input} type="file" className="sr-only" accept=".tif,.tiff,.png,.jpg,.jpeg"
        aria-label={`${label} file`} onChange={e => { take(e.target.files); e.target.value = '' }}
      />
      <div className="flex items-center gap-3 p-3">
        <span className={`grid size-8 shrink-0 place-items-center border font-mono text-sm font-semibold ${slot.file ? 'border-ink bg-ink text-paper' : 'border-rule-strong text-ink-2'}`}>{letter}</span>
        {slot.file ? (
          <>
            <div className="min-w-0 flex-1">
              <div className="truncate font-mono text-sm">{slot.file.name}</div>
              <div className="text-[13px] text-ink-3">{fmtBytes(slot.file.size)}</div>
            </div>
            <button
              type="button" onClick={() => update(index, { file: null })} aria-label={`Remove ${label}`}
              className="grid size-9 place-items-center rounded-[3px] text-ink-3 hover:bg-well hover:text-ink"
            ><X size={16} /></button>
          </>
        ) : (
          <button type="button" onClick={() => input.current.click()} className="min-w-0 flex-1 py-0.5 text-left">
            <span className="block text-sm font-semibold">{drag ? 'Drop to load' : 'Choose or drop a GeoTIFF'}</span>
            <span className="block text-[13px] text-ink-3">{hint}</span>
          </button>
        )}
      </div>
      <div className="grid grid-cols-3 border-t border-rule" role="radiogroup" aria-label={`${label} modality`}>
        {MODS.map(([m, text], j) => (
          <button
            key={m} type="button" role="radio" aria-checked={slot.mod === m} onClick={() => update(index, { mod: m })}
            className={`h-9 text-[13px] text-ink-2 hover:text-ink aria-checked:bg-ink aria-checked:font-semibold aria-checked:text-paper ${j ? 'border-l border-rule' : ''}`}
          >{text}</button>
        ))}
      </div>
    </div>
  )
}

/* The image frame with pixel ticks. Labels show the scene size when known. */
function Neatline({ size, children }) {
  return (
    <div className="relative mx-[8px] mt-7 mb-[8px]">
      <span className="tick-x t" /><span className="tick-x b" /><span className="tick-y l" /><span className="tick-y r" />
      {size && (
        <div className="absolute inset-x-0 -top-7 flex justify-between font-mono text-xs text-ink-3" aria-hidden="true">
          <span>0</span><span>{size[0]} px</span>
        </div>
      )}
      <div className="border border-ink bg-well">{children}</div>
    </div>
  )
}

function Empty({ onSample }) {
  return (
    <div className="enter mx-auto grid max-w-5xl gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] xl:items-center">
      <div>
        <h1 className="max-w-[20ch] text-[28px] font-bold leading-tight tracking-tight">Ask a question about a satellite scene.</h1>
        <p className="mt-3 max-w-[56ch] leading-relaxed text-ink-2">
          Load imagery on the left, or start from a sample below. The answer arrives with the masks, the measured
          numbers and every tool call that produced them, ready to download as a report.
        </p>
        <h2 className="mt-8 text-sm text-ink-3">Sample scenes (synthetic, 256 px)</h2>
        <ul className="mt-2 border-t border-rule">
          {SAMPLES.map(s => (
            <li key={s.title} className="border-b border-rule">
              <button type="button" onClick={() => onSample(s)} className="group flex w-full items-center justify-between gap-4 py-3.5 text-left">
                <span>
                  <span className="block font-semibold">{s.title}</span>
                  <span className="block font-mono text-[13px] text-ink-3">{s.sensor}</span>
                </span>
                <ArrowRight size={18} className="shrink-0 text-ink-3 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-ink" />
              </button>
            </li>
          ))}
        </ul>
      </div>
      <Neatline>
        <div className="grid aspect-square place-items-center p-8 text-center text-sm text-ink-3">
          No scene loaded
        </div>
      </Neatline>
    </div>
  )
}

function Loading({ started }) {
  const [t, setT] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setT((Date.now() - started) / 1000), 100)
    return () => clearInterval(id)
  }, [started])
  return (
    <div className="enter grid gap-8" aria-busy="true">
      <div className="flex items-baseline justify-between gap-4 text-sm text-ink-2">
        <span>Validating inputs, planning tools, running them. The first MAIN call can take a minute.</span>
        <span className="font-mono tabular-nums text-ink">{t.toFixed(1)} s</span>
      </div>
      <div className="grid max-w-[68ch] gap-3">
        <div className="pulse h-5 w-full bg-well" />
        <div className="pulse h-5 w-4/5 bg-well" />
      </div>
      <div className="grid gap-10 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Neatline><div className="pulse aspect-square" /></Neatline>
        <div className="grid content-start gap-3">{[0, 1, 2, 3].map(i => <div key={i} className="pulse h-8 bg-well" />)}</div>
      </div>
    </div>
  )
}

function ErrorBox({ message }) {
  return (
    <div role="alert" className="enter flex max-w-3xl gap-3 rounded-[3px] border border-bad/40 bg-bad/5 p-5">
      <WarningCircle size={22} weight="fill" className="shrink-0 text-bad" />
      <div>
        <div className="font-semibold">The analysis did not run</div>
        <p className="mt-1 leading-relaxed text-ink-2">{message}</p>
      </div>
    </div>
  )
}

function Result({ res, served, vlmOnline }) {
  const t = res.trace
  const vlmOk = t.steps.some(s => s.tool.startsWith('vlm_') && s.status === 'ok')
  const measured = t.steps.filter(s => s.status === 'ok' && s.stats)
  const pct = res.confidence == null ? null : res.confidence * 100
  return (
    <div className="enter grid gap-10">
      <section aria-labelledby="ans-h">
        <h1 id="ans-h" className="sr-only">Answer</h1>
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
          <p className="max-w-[68ch] text-sm text-ink-3">Q. <span className="text-ink-2">{res.query}</span></p>
          <div className="flex gap-2">
            <button
              type="button" onClick={() => save('satquery_report.html', res.report_html, 'text/html')}
              className="flex h-10 items-center gap-2 rounded-[3px] bg-ink px-4 text-sm font-semibold text-paper hover:bg-ink-2"
            ><DownloadSimple size={16} weight="bold" />Report</button>
            <button
              type="button" onClick={() => save('satquery_trace.json', JSON.stringify({ query: res.query, answer: res.answer, confidence: res.confidence, evidence: res.evidence, trace: t }, null, 2), 'application/json')}
              className="flex h-10 items-center gap-2 rounded-[3px] border border-rule-strong px-4 text-sm hover:border-ink"
            ><DownloadSimple size={16} />Trace JSON</button>
          </div>
        </div>
        <p className="mt-4 max-w-[68ch] whitespace-pre-line text-lg leading-normal md:text-xl">{res.answer}</p>
        {!vlmOk && (
          <p className="mt-4 flex max-w-[68ch] items-start gap-2 text-sm text-warn">
            <WarningCircle size={17} weight="fill" className="mt-0.5 shrink-0" />
            {vlmOnline
              ? 'The language-model step failed for this query. The numbers below are still measured from the pixels.'
              : 'Language model offline. Start Ollama (ollama serve) for written answers. The numbers below are measured from the pixels.'}
          </p>
        )}
        <dl className="mt-6 grid grid-cols-2 gap-x-6 border-y border-rule text-sm md:grid-cols-4">
          <Reading k="Task" v={pretty(t.task)} />
          <Reading k="Input" v={CONFIG_LABEL[t.input_config] ?? t.input_config} />
          <Reading k="Served by" v={served} />
          <Reading k="Confidence" mono title="Mean of VLM token probability and tool agreement" v={pct == null ? 'n/a' : (
            <span className="flex items-center gap-2.5">
              {pct.toFixed(1)} %
              <span className="h-1.5 w-16 bg-well"><span className="block h-full bg-ink" style={{ width: `${pct}%` }} /></span>
            </span>
          )} />
        </dl>
      </section>

      <div className="grid gap-10 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Viewer images={res.images} size={t.inputs[0]?.size} />
        <div className="grid content-start gap-10">
          {measured.length > 0 && <Measurements steps={measured} />}
          <Inputs inputs={t.inputs} />
        </div>
      </div>

      <Trace trace={t} />
    </div>
  )
}

const Reading = ({ k, v, title, mono }) => (
  <div className="flex flex-col gap-1 py-3" title={title}>
    <dt className="text-ink-3">{k}</dt>
    <dd className={`font-semibold ${mono ? 'font-mono tabular-nums' : ''}`}>{v}</dd>
  </div>
)

function Viewer({ images, size }) {
  // open on the last evidence mask: the most specific one (e.g. VLM grounding refined by the index mask)
  const [i, setI] = useState(Math.max(0, images.findLastIndex(x => x.label.startsWith('evidence'))))
  const cur = images[i]
  return (
    <section aria-label="Imagery" className="min-w-0">
      <Neatline size={size}>
        <img src={`data:image/png;base64,${cur.png}`} alt={cur.label} className="block aspect-square w-full object-contain [image-rendering:pixelated]" />
      </Neatline>
      <div className="mt-3 flex items-baseline justify-between gap-4 text-sm">
        <span className="min-w-0 truncate font-mono">{cur.label}</span>
        {cur.label.startsWith('evidence') && (
          <span className="flex shrink-0 items-center gap-2 text-ink-2"><span className="size-3 bg-[rgb(228,48,32)]" />detected pixels</span>
        )}
      </div>
      <div className="mt-4 flex gap-3 overflow-x-auto pb-1" role="tablist" aria-label="Layers">
        {images.map((im, j) => (
          <button
            key={j} type="button" role="tab" aria-selected={i === j} onClick={() => setI(j)} title={im.label}
            className="w-[88px] shrink-0 text-left"
          >
            <img
              src={`data:image/png;base64,${im.png}`} alt=""
              className={`aspect-square w-full object-cover [image-rendering:pixelated] ${i === j ? 'outline-2 outline-offset-2 outline-ink' : 'opacity-80 hover:opacity-100'}`}
            />
            <span className={`mt-1.5 block truncate text-xs ${i === j ? 'font-semibold text-ink' : 'text-ink-3'}`}>
              {im.label.split(':')[0]}{im.label.match(/ on input (\d)$/)?.[1].replace(/^/, ' T') ?? ''}
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

function Measurements({ steps }) {
  return (
    <section aria-labelledby="ev-h">
      <h2 id="ev-h" className="text-[15px] font-semibold">Measured evidence</h2>
      {steps.map(s => (
        <table key={s.tool} className="mt-4 w-full text-sm">
          <caption className="pb-1.5 text-left font-mono text-[13px] text-ink-3">{s.tool}</caption>
          <tbody className="border-t border-rule">
            {Object.entries(s.stats).map(([k, v]) => (
              <tr key={k} className="border-b border-rule">
                <th scope="row" className="py-2 pr-4 text-left font-normal text-ink-2">{pretty(k)}</th>
                <td className="py-2 text-right font-mono tabular-nums">{String(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </section>
  )
}

function Inputs({ inputs }) {
  return (
    <section aria-labelledby="in-h">
      <h2 id="in-h" className="text-[15px] font-semibold">Inputs</h2>
      <ul className="mt-3 border-t border-rule">
        {inputs.map((im, j) => (
          <li key={j} className="border-b border-rule py-2.5">
            <div className="truncate font-mono text-sm">{im.name}</div>
            <div className="mt-0.5 text-[13px] text-ink-3">
              {im.modality} · {im.bands} band{im.bands > 1 ? 's' : ''} · {Array.isArray(im.size) ? im.size.join(' × ') : im.size} px · {im.crs ?? 'no CRS'}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

const STATUS = {
  ok: [CheckCircle, 'text-ok'],
  skipped: [Prohibit, 'text-ink-3'],
  vlm_offline: [WarningCircle, 'text-warn'],
  error: [XCircle, 'text-bad'],
}

function Trace({ trace }) {
  const [open, setOpen] = useState(null)
  const total = trace.steps.reduce((a, s) => a + s.ms, 0)
  return (
    <section aria-labelledby="tr-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="tr-h" className="text-[15px] font-semibold">Execution trace</h2>
        <span className="font-mono text-[13px] text-ink-3">{trace.steps.length} steps · {total.toLocaleString()} ms</span>
      </div>
      <ol className="mt-3 border-t border-rule">
        {trace.steps.map((s, i) => {
          const [Icon, color] = STATUS[s.status] ?? STATUS.error
          const expanded = open === i
          return (
            <li key={i} className="border-b border-rule">
              <button
                type="button" onClick={() => setOpen(expanded ? null : i)} aria-expanded={expanded}
                className="grid w-full grid-cols-[2rem_minmax(0,1fr)_auto_auto] items-center gap-3 py-2.5 text-left text-sm hover:bg-sheet"
              >
                <span className="font-mono text-ink-3">{String(i + 1).padStart(2, '0')}</span>
                <span className="truncate font-mono">{s.tool}</span>
                <span className={`flex items-center gap-1.5 ${color}`}><Icon size={16} weight="fill" />{pretty(s.status)}</span>
                <span className="flex items-center justify-end gap-2 whitespace-nowrap font-mono tabular-nums text-ink-2">
                  {s.ms.toLocaleString()} ms <CaretDown size={12} className={`transition-transform duration-150 ${expanded ? 'rotate-180' : ''}`} />
                </span>
              </button>
              {expanded && (
                <dl className="enter mb-3 ml-[2.75rem] grid gap-1.5 bg-sheet p-3 font-mono text-[13px] leading-relaxed">
                  <Row k="params" v={JSON.stringify(s.params)} />
                  {s.stats && <Row k="stats" v={JSON.stringify(s.stats)} />}
                  {s.conf != null && <Row k="conf" v={s.conf} />}
                  {s.output && <Row k="output" v={s.output} />}
                </dl>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

const Row = ({ k, v }) => (
  <div className="grid grid-cols-[4.5rem_1fr] gap-2">
    <dt className="text-ink-3">{k}</dt>
    <dd className="break-words">{String(v)}</dd>
  </div>
)
