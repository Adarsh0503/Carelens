'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

type Message = { role: 'user' | 'assistant'; content: string; streaming?: boolean; ts?: number }
type Theme = 'light' | 'dark' | 'system'

const QUICK_SYMPTOMS = [
  { label: 'Headache + fever',    icon: '🤕' },
  { label: 'Chest tightness',     icon: '💗' },
  { label: 'Fatigue',             icon: '😴' },
  { label: 'Stomach pain',        icon: '🫀' },
  { label: 'Cough + sore throat', icon: '🤒' },
  { label: 'Shortness of breath', icon: '🌬️' },
  { label: 'Skin rash',           icon: '🩹' },
  { label: 'Dizziness',           icon: '💫' },
]

const TIMELINE_OPTIONS = [
  { label: 'Today',     value: 'started today' },
  { label: '2–3 days',  value: 'for 2–3 days' },
  { label: '1 week',    value: 'for about a week' },
  { label: '1 month+',  value: 'for over a month' },
]

const THINKING = [
  'Analyzing your symptoms…',
  'Checking severity patterns…',
  'Preparing your assessment…',
  'Almost ready…',
]

const WELCOME: Message = {
  role: 'assistant',
  content: `Hello! I'm **CareLens**, your personal symptom clarifier. 👋\n\nDescribe what you're feeling and I'll help you understand it in plain English — no jargon, no panic.\n\n*Not a doctor. For informational purposes only.*`,
  ts: Date.now(),
}

// ── Theme ──────────────────────────────────────────────────────────────
function resolveTheme(t: Theme): 'light' | 'dark' {
  if (t !== 'system') return t
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
function applyTheme(t: Theme) {
  document.documentElement.setAttribute('data-theme', resolveTheme(t))
}

// ── Helpers ────────────────────────────────────────────────────────────
function fmtTime(ts?: number) {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// ── Markdown renderer — robust ─────────────────────────────────────────
function parseBold(str: string): React.ReactNode[] {
  // Split on **text** only — handles unclosed gracefully
  const parts = str.split(/\*\*([^*]+)\*\*/g)
  return parts.map((p, i) =>
    i % 2 === 1 ? <strong key={i} style={{ fontWeight: 600 }}>{p}</strong> : p
  )
}

function RenderContent({ text, streaming }: { text: string; streaming?: boolean }) {
  const lines = text.split('\n')
  const out: React.ReactNode[] = []
  const bullets: string[] = []

  const flush = (k: string) => {
    if (!bullets.length) return
    const items = [...bullets]
    bullets.length = 0
    out.push(
      <ul key={k} style={{ margin: '6px 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
        {items.map((b, i) => (
          <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, lineHeight: 1.6 }}>
            <span style={{ color: 'var(--green)', marginTop: 4, fontSize: '0.5rem', flexShrink: 0 }}>●</span>
            <span>{parseBold(b)}</span>
          </li>
        ))}
      </ul>
    )
  }

  lines.forEach((line, i) => {
    const raw = line
    const t = raw.trim()

    // Empty line
    if (!t) { flush(`b${i}`); out.push(<div key={`sp${i}`} style={{ height: 4 }} />); return }

    // Skip triage emoji lines — shown as badge separately
    if (/^[🚨📅🏠]/.test(t)) return

    // Italic disclaimer: *text* (single asterisk, not **)
    // Must start with * but NOT ** and end with *
    if (t.startsWith('*') && !t.startsWith('**') && t.endsWith('*') && t.length > 2) {
      flush(`di${i}`)
      out.push(<p key={i} style={{ fontSize: '0.72rem', opacity: 0.38, fontStyle: 'italic', margin: '8px 0 0', lineHeight: 1.5 }}>{t.slice(1, -1)}</p>)
      return
    }

    // Bullet: "- text" OR "* text" (but not **bold**)
    if (t.startsWith('- ')) { bullets.push(t.slice(2)); return }
    if (t.startsWith('* ') && !t.startsWith('**')) { bullets.push(t.slice(2)); return }

    // Numbered list: "1. text"
    if (/^\d+\.\s/.test(t)) { bullets.push(t.replace(/^\d+\.\s/, '')); return }

    // If line is ONLY an asterisk or dash (LLM sometimes outputs stray ones), skip
    if (t === '*' || t === '-' || t === '•') return

    flush(`p${i}`)
    out.push(<p key={i} style={{ lineHeight: 1.65, margin: '2px 0' }}>{parseBold(t)}</p>)
  })

  flush('end')

  return (
    <div className={streaming ? 'streaming-cursor' : ''} style={{ display: 'flex', flexDirection: 'column', gap: 1, fontSize: '0.875rem' }}>
      {out}
    </div>
  )
}

// ── Detect triage in completed message ────────────────────────────────
function detectTriage(text: string): 'emergency' | 'soon' | 'home' | null {
  if (text.includes('🚨')) return 'emergency'
  if (text.includes('📅')) return 'soon'
  if (text.includes('🏠')) return 'home'
  return null
}

// ── Triage badge ───────────────────────────────────────────────────────
function TriageBadge({ level }: { level: 'emergency' | 'soon' | 'home' }) {
  const cfg = {
    emergency: { cls: 'badge-error', icon: '🚨', label: 'EMERGENCY — Seek immediate care' },
    soon:      { cls: 'badge-soon',  icon: '📅', label: 'See a doctor soon' },
    home:      { cls: 'badge-home',  icon: '🏠', label: 'Manageable at home' },
  }[level]
  return <div className={`badge ${cfg.cls}`}>{cfg.icon} {cfg.label}</div>
}

// ── Find doctor ────────────────────────────────────────────────────────
function FindDoctorBtn({ level }: { level: 'soon' | 'emergency' }) {
  const [busy, setBusy] = useState(false)
  const emergency = level === 'emergency'
  const go = () => {
    setBusy(true)
    const q = emergency ? 'emergency hospital near me' : 'GP doctor clinic near me'
    const open = (lat?: number, lng?: number) => {
      window.open(`https://www.google.com/maps/search/${encodeURIComponent(q)}` + (lat ? `/@${lat},${lng},14z` : ''), '_blank')
      setBusy(false)
    }
    navigator.geolocation
      ? navigator.geolocation.getCurrentPosition(p => open(p.coords.latitude, p.coords.longitude), () => open(), { timeout: 5000 })
      : open()
  }
  return (
    <button onClick={go} disabled={busy} className="find-doctor-btn" style={{
      borderColor: emergency ? 'var(--badge-err-border)' : 'var(--green-border)',
      background:  emergency ? 'var(--badge-err-bg)' : 'var(--green-glow)',
      color:       emergency ? 'var(--badge-err-text)' : 'var(--green)',
    }}>
      {busy ? '📍 Locating…' : emergency ? '🏥 Find nearest ER' : '📍 Find a doctor nearby'}
      {!busy && <span style={{ fontSize: '0.65rem', opacity: 0.5 }}>↗</span>}
    </button>
  )
}

// ── Emergency overlay ──────────────────────────────────────────────────
function EmergencyOverlay({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.93)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(12px)', animation: 'fadeIn 0.25s ease' }}>
      <div style={{ background: '#150a0a', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 22, padding: '40px 28px', maxWidth: 440, width: '100%', textAlign: 'center', animation: 'scaleIn 0.35s cubic-bezier(0.16,1,0.3,1)', position: 'relative' }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(248,113,113,0.1)', border: '2px solid rgba(248,113,113,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, margin: '0 auto 20px', animation: 'pulseGlow 1.5s ease-in-out infinite' }}>🚨</div>
        <h2 style={{ color: '#f87171', fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 700, margin: '0 0 10px' }}>Seek Emergency Care</h2>
        <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.875rem', lineHeight: 1.7, margin: '0 0 28px' }}>Your symptoms may require immediate attention. Please call emergency services or go to your nearest emergency room now.</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
          <a href="tel:112" style={{ background: '#ef4444', color: 'white', borderRadius: 12, padding: '12px 24px', fontWeight: 700, fontSize: '0.95rem', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 18px rgba(239,68,68,0.3)' }}>📞 Call 112</a>
          <a href="tel:911" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '12px 24px', fontWeight: 700, fontSize: '0.95rem', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>📞 Call 911</a>
        </div>
        <button onClick={onDismiss} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.28)', fontSize: '0.74rem', cursor: 'pointer', fontFamily: 'var(--font-body)', textDecoration: 'underline' }}>I understand, continue reading</button>
        <button onClick={onDismiss} style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', fontSize: '1rem', fontFamily: 'var(--font-body)' }}>✕</button>
      </div>
    </div>
  )
}

// ── Typing dots ────────────────────────────────────────────────────────
function TypingDots({ msg }: { msg: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }} className="msg-appear">
      <div className="avatar pulse-glow">C</div>
      <div className="bubble-bot" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {[0,1,2].map(i => <div key={i} className="dot" style={{ animationDelay: `${i*0.18}s` }} />)}
        </div>
        <span style={{ fontSize: '0.78rem', color: 'var(--subtext)', fontStyle: 'italic' }}>{msg}</span>
      </div>
    </div>
  )
}

// ── Message bubble ─────────────────────────────────────────────────────
function Bubble({ msg, isWelcome }: { msg: Message; isWelcome?: boolean }) {
  const isUser = msg.role === 'user'
  const triage = !msg.streaming ? detectTriage(msg.content) : null

  return (
    <div className="msg-appear" style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexDirection: isUser ? 'row-reverse' : 'row' }}>
      {!isUser && (
        <div className={`avatar ${isWelcome ? 'pulse-glow' : ''}`} style={{ flexShrink: 0, opacity: isWelcome ? 1 : 0.9 }}>C</div>
      )}
      <div style={{ maxWidth: '75%', display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', gap: 5 }}>
        <div className={isUser ? 'bubble-user' : isWelcome ? 'bubble-welcome' : 'bubble-bot'}>
          {isUser
            ? <span style={{ fontSize: '0.875rem', lineHeight: 1.6 }}>{msg.content}</span>
            : <RenderContent text={msg.content} streaming={msg.streaming} />
          }
        </div>
        {/* Triage — only shown on completed non-streaming messages */}
        {triage && !isUser && !msg.streaming && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
            <TriageBadge level={triage} />
            {(triage === 'soon' || triage === 'emergency') && <FindDoctorBtn level={triage} />}
          </div>
        )}
        {/* Timestamp */}
        {msg.ts && (
          <span style={{ fontSize: '0.64rem', color: 'var(--muted)', marginTop: 1 }}>{fmtTime(msg.ts)}</span>
        )}
      </div>
    </div>
  )
}

// ── Theme toggle ───────────────────────────────────────────────────────
function ThemeToggle({ theme, set }: { theme: Theme; set: (t: Theme) => void }) {
  const opts: { value: Theme; icon: string; label: string }[] = [
    { value: 'light',  icon: '☀️', label: 'Light' },
    { value: 'dark',   icon: '🌙', label: 'Dark' },
    { value: 'system', icon: '💻', label: 'System' },
  ]
  const cur = opts.find(o => o.value === theme)!
  const next = () => set(opts[(opts.findIndex(o => o.value === theme)+1) % opts.length].value)
  return (
    <button className="theme-btn" onClick={next} style={{ padding: '6px 13px', fontSize: '0.78rem', fontWeight: 500, minHeight: 34 }}>
      <span>{cur.icon}</span><span className="theme-label">{cur.label}</span>
    </button>
  )
}

// ── Logo ───────────────────────────────────────────────────────────────
function Logo() {
  return <span className="logo-text">Care<span className="logo-accent">Lens</span></span>
}

// ── Landing ────────────────────────────────────────────────────────────
function Landing({ onSend }: { onSend: (t: string) => void }) {
  const [val, setVal] = useState('')
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const ta = taRef.current
    if (ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 100) + 'px' }
  }, [val])

  const submit = () => { if (val.trim()) onSend(val.trim()) }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 20px 24px', maxWidth: 580, margin: '0 auto', width: '100%' }}>

      <div className="floating fade-up" style={{ marginBottom: 20 }}>
        <div style={{ width: 80, height: 80, borderRadius: 22, background: 'var(--green-glow)', border: '1px solid var(--green-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, boxShadow: 'var(--shadow-green)' }}>🩺</div>
      </div>

      <div className="fade-up fade-up-1" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--green-glow)', border: '1px solid var(--green-border)', color: 'var(--green)', borderRadius: 100, padding: '5px 14px', fontSize: '0.72rem', fontWeight: 600, marginBottom: 18 }}>
        ✦ AI-powered · Not a diagnosis
      </div>

      <h1 className="fade-up fade-up-2" style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 6vw, 3rem)', fontWeight: 700, margin: '0 0 12px', lineHeight: 1.1, textAlign: 'center', letterSpacing: '-0.02em' }}>
        <span style={{ color: 'var(--text)' }}>Understand your </span>
        <span style={{ color: 'var(--green)' }}>symptoms</span>
      </h1>

      <p className="fade-up fade-up-3" style={{ color: 'var(--subtext)', fontSize: '1rem', maxWidth: 360, margin: '0 auto 28px', lineHeight: 1.7, textAlign: 'center' }}>
        Plain-English clarity on what your body might be telling you — plus what to do next.
      </p>

      {/* Input card */}
      <div className="hero-card fade-up fade-up-3" style={{ width: '100%', marginBottom: 16, padding: '18px 18px 16px' }}>
        <textarea
          ref={taRef}
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
          placeholder="e.g. headache and fever"
          rows={2}
          className="cl-input"
          style={{ padding: '12px 14px', fontSize: '0.95rem', lineHeight: 1.6, marginBottom: 10, borderRadius: 12 }}
          autoFocus
        />
        <button className="btn-primary" onClick={submit} disabled={!val.trim()} style={{ width: '100%', padding: '13px 20px', fontSize: '0.95rem', borderRadius: 12 }}>
          Analyze Symptoms →
        </button>
      </div>



      {/* Quick chips */}
      <div className="fade-up fade-up-5" style={{ textAlign: 'center', width: '100%' }}>
        <p style={{ fontSize: '0.66rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 9 }}>Or pick a symptom</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, justifyContent: 'center' }}>
          {QUICK_SYMPTOMS.map(({ label, icon }) => (
            <button key={label} className="chip" onClick={() => onSend(label)} style={{ padding: '7px 14px', fontSize: '0.8rem' }}>
              {icon} {label}
            </button>
          ))}
        </div>
      </div>

      <p className="disclaimer fade-up fade-up-5" style={{ marginTop: 24 }}>
        ⚠️ CareLens provides general information only and is not a medical diagnosis.
      </p>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────
export default function Home() {
  const [msgs,    setMsgs]  = useState<Message[]>([])
  const [input,   setInput] = useState('')
  const [busy,    setBusy]  = useState(false)
  const [err,     setErr]   = useState<string | null>(null)
  const [inChat,  setChat]  = useState(false)
  const [theme,   setTheme] = useState<Theme>('system')
  const [showTL,  setShowTL]= useState(false)
  const [thinking,setThink] = useState(THINKING[0])
  const [overlay, setOver]  = useState(false)
  const [showScrollTop, setShowScrollTop] = useState(false)

  const endRef      = useRef<HTMLDivElement>(null)
  const messagesRef = useRef<HTMLDivElement>(null)
  const taRef   = useRef<HTMLTextAreaElement>(null)
  const tmrRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  // Use mousedown ref to handle timeline click before blur fires
  const tlClickRef = useRef(false)

  useEffect(() => {
    applyTheme(theme)
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      const h = () => applyTheme('system')
      mq.addEventListener('change', h); return () => mq.removeEventListener('change', h)
    }
  }, [theme])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, busy])

  // Show scroll-to-top button when user scrolls up in chat
  useEffect(() => {
    const el = messagesRef.current
    if (!el) return
    const onScroll = () => setShowScrollTop(el.scrollTop > 300)
    el.addEventListener('scroll', onScroll)
    return () => el.removeEventListener('scroll', onScroll)
  }, [inChat])

  useEffect(() => {
    const ta = taRef.current
    if (ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px' }
  }, [input])

  const startThink = () => {
    let i = 0; setThink(THINKING[0])
    tmrRef.current = setInterval(() => { i = (i+1) % THINKING.length; setThink(THINKING[i]) }, 1800)
  }
  const stopThink = () => { if (tmrRef.current) { clearInterval(tmrRef.current); tmrRef.current = null } }

  // Timeline visibility: show when typing symptom without duration
  const updateTimeline = (val: string) => {
    // Only show after bot has asked at least one clarifying question
    const botHasReplied = msgs.filter(m => m.role === 'assistant').length > 1

    // Check if user has ALREADY mentioned time in ANY previous user message
    const alreadyAnsweredTime = msgs
      .filter(m => m.role === 'user')
      .some(m => /\b(day|days|week|weeks|month|months|hour|hours|since|ago|yesterday|today|morning|night|started|begin|began)\b/i.test(m.content))

    const hasContent = val.length > 6
    const hasTimeInInput = /\b(day|days|week|weeks|month|months|hour|hours|since|ago|yesterday|today|morning|night|started|begin|began)\b/i.test(val)

    // Hide if: bot hasn't replied, user already answered time, or current input has time
    setShowTL(botHasReplied && !alreadyAnsweredTime && hasContent && !hasTimeInInput)
  }

  const send = useCallback(async (txt?: string) => {
    const content = (txt || input).trim()
    if (!content || busy) return
    setErr(null); setShowTL(false)

    const isFirst = !inChat
    const history: Message[] = isFirst ? [WELCOME] : msgs
    const userMsg: Message = { role: 'user', content, ts: Date.now() }
    const updated = [...history, userMsg]

    if (isFirst) setChat(true)
    setMsgs(updated); setInput(''); setBusy(true); startThink()

    try {
      const res = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updated }),
      })
      if (!res.ok) throw new Error()
      const reader = res.body?.getReader()
      const dec = new TextDecoder()
      let acc = ''
      stopThink(); setBusy(false)
      setMsgs(p => [...p, { role: 'assistant', content: '', streaming: true, ts: Date.now() }])
      while (reader) {
        const { done, value } = await reader.read()
        if (done) break
        acc += dec.decode(value, { stream: true })
        setMsgs(p => [...p.slice(0,-1), { role: 'assistant', content: acc, streaming: true }])
      }
      setMsgs(p => [...p.slice(0,-1), { role: 'assistant', content: acc, streaming: false, ts: Date.now() }])
      if (acc.includes('🚨')) setTimeout(() => setOver(true), 600)
    } catch {
      stopThink(); setBusy(false)
      setErr('Something went wrong. Check your connection and try again.')
    }
  }, [input, busy, msgs, inChat])

  const reset = () => { setMsgs([]); setChat(false); setErr(null); setInput(''); setOver(false); setShowTL(false) }

  const appendTimeline = (value: string) => {
    setInput(p => {
      const base = p.trimEnd()
      // If input already has content, append with space; otherwise just set
      return base ? base + ' ' + value : value
    })
    setShowTL(false)
    taRef.current?.focus()
  }

  const charCount = input.length
  const charCls = charCount > 450 ? 'limit' : charCount > 350 ? 'warn' : ''
  const userMsgCount = msgs.filter(m => m.role === 'user').length

  return (
    <div className="mesh-bg">
      {overlay && <EmergencyOverlay onDismiss={() => setOver(false)} />}

      {/* HEADER */}
      <header className="header" style={{ padding: '0 20px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: inChat ? 'pointer' : 'default' }} onClick={inChat ? reset : undefined} title={inChat ? 'Back to home' : ''}>
          <div className="avatar pulse-glow" style={{ width: 32, height: 32, borderRadius: 9, fontSize: 13 }}>C</div>
          <Logo />
          <span className="header-subtitle" style={{ fontSize: '0.68rem', color: 'var(--muted)', marginLeft: 2 }}>symptom clarifier</span>
          {inChat && userMsgCount > 0 && (
            <div className="status-pill" style={{ marginLeft: 4 }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--green)', animation: 'blink 2s ease-in-out infinite' }} />
              Active
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          {inChat && <button className="btn-ghost" onClick={reset} style={{ padding: '5px 12px', fontSize: '0.77rem', fontWeight: 500, borderRadius: 8, minHeight: 32 }}>↺ New chat</button>}
          <ThemeToggle theme={theme} set={setTheme} />
        </div>
      </header>

      {/* PAGES */}
      {!inChat ? (
        <Landing onSend={send} />
      ) : (
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: 700, width: '100%', margin: '0 auto', padding: '20px 16px 0', gap: 12 }}>

          {/* Messages */}
          <div ref={messagesRef} style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, overflowY: 'auto', paddingRight: 2 }}>
            {msgs.map((msg, i) => (
              <Bubble key={i} msg={msg} isWelcome={i === 0 && msg.role === 'assistant'} />
            ))}

            {/* Loading */}
            {busy && <TypingDots msg={thinking} />}

            {/* Error */}
            {err && (
              <div className="error-banner">
                <span style={{ fontSize: '1.1rem' }}>⚠️</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>Something went wrong</div>
                  <div style={{ fontSize: '0.78rem', opacity: 0.75, marginTop: 2 }}>Check your connection and try again.</div>
                </div>
                <button onClick={() => setErr(null)} className="btn-ghost" style={{ padding: '4px 10px', fontSize: '0.74rem', borderRadius: 7, flexShrink: 0 }}>✕</button>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Scroll to top button */}
          {showScrollTop && (
            <button
              onClick={() => messagesRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
              style={{
                position: 'fixed', bottom: 100, right: 24, zIndex: 40,
                width: 40, height: 40, borderRadius: '50%',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                color: 'var(--subtext)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', fontSize: '1rem',
                boxShadow: 'var(--shadow-md)',
                transition: 'all 0.2s ease',
                animation: 'fadeIn 0.2s ease',
              }}
              title="Scroll to top"
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--green)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--green)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--subtext)' }}
            >↑</button>
          )}

          {/* INPUT */}
          <div className="input-sticky">
            <div className="input-wrapper">

              {/* Timeline picker — fixed race condition with mousedown */}
              {showTL && (
                <div
                  className="slide-down"
                  style={{ padding: '9px 13px 8px', borderBottom: '1px solid var(--border)' }}
                  onMouseDown={() => { tlClickRef.current = true }}
                >
                  <span style={{ fontSize: '0.64rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>
                    ⏱ When did it start?
                  </span>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                    {TIMELINE_OPTIONS.map(({ label, value }) => (
                      <button
                        key={label}
                        className="chip"
                        onMouseDown={e => { e.preventDefault(); appendTimeline(value) }}
                        style={{ padding: '5px 12px', fontSize: '0.76rem', minHeight: 30 }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ padding: '11px 13px 9px' }}>
                <textarea
                  ref={taRef}
                  value={input}
                  onChange={e => { setInput(e.target.value); updateTimeline(e.target.value) }}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                  onBlur={() => {
                    if (tlClickRef.current) { tlClickRef.current = false; return }
                    setTimeout(() => setShowTL(false), 100)
                  }}
                  placeholder="Describe your symptoms or reply here…"
                  rows={1} maxLength={500}
                  style={{ width: '100%', padding: '1px 4px', fontSize: '0.875rem', lineHeight: 1.55, minHeight: 26, background: 'transparent', color: 'var(--text)', outline: 'none', resize: 'none', fontFamily: 'var(--font-body)' }}
                />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 7 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="keyboard-hint" style={{ fontSize: '0.67rem', color: 'var(--muted)' }}>
                      Enter to send · Shift+Enter for new line
                    </span>
                    {charCount > 0 && <span className={`char-counter ${charCls}`}>{charCount}/500</span>}
                  </div>
                  <button
                    className="btn-primary"
                    onClick={() => send()}
                    disabled={!input.trim() || busy}
                    style={{ padding: '9px 18px', fontSize: '0.85rem', borderRadius: 10, minHeight: 38, gap: 8 }}
                  >
                    {busy ? <><div className="spinner" /><span>Analyzing…</span></> : 'Send →'}
                  </button>
                </div>
              </div>
            </div>

            <p className="disclaimer" style={{ marginTop: 8 }}>
              ⚠️ CareLens provides general information only and is not a medical diagnosis.
            </p>
          </div>
        </main>
      )}
    </div>
  )
}