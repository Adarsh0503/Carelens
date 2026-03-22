'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

type Message = { role: 'user' | 'assistant'; content: string; streaming?: boolean; ts?: number }
type Theme = 'light' | 'dark' | 'system'

// ── Constants ──────────────────────────────────────────────────────────
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
  { label: 'Today',    value: 'started today' },
  { label: '2–3 days', value: 'for 2–3 days' },
  { label: '1 week',   value: 'for about a week' },
  { label: '1 month+', value: 'for over a month' },
]

const THINKING = [
  'Analyzing your symptoms…',
  'Checking severity patterns…',
  'Preparing your assessment…',
  'Almost ready…',
]

// ⌨️ Animated placeholder phrases
const PLACEHOLDERS = [
  'e.g. headache and fever…',
  'e.g. chest tightness since morning…',
  'e.g. fatigue for 3 weeks…',
  'e.g. sore throat and runny nose…',
  'e.g. stomach pain after eating…',
  'e.g. dizziness when standing up…',
]

// 💬 Follow-up suggestion chips by context
const FOLLOWUP_HOME = [
  'What can I do at home?',
  'Should I rest?',
  'Can I take painkillers?',
]
const FOLLOWUP_SOON = [
  'What should I tell my doctor?',
  'Is it getting worse?',
  'What tests might I need?',
]
const FOLLOWUP_EMERGENCY = [
  'What do I do while waiting for help?',
  'Should someone stay with me?',
]
const FOLLOWUP_CLARIFY = [
  'It\'s getting worse',
  'I also have nausea',
  'I have no other symptoms',
  'I took some medicine',
]

// 🫀 Body map regions
const BODY_PARTS = [
  { id: 'head',        label: 'Head',          symptom: 'headache or head pain',        x: 72, y: 8,  w: 16, h: 14 },
  { id: 'neck',        label: 'Throat/Neck',   symptom: 'sore throat or neck pain',     x: 76, y: 22, w: 8,  h: 6  },
  { id: 'chest',       label: 'Chest',         symptom: 'chest pain or tightness',      x: 66, y: 30, w: 28, h: 14 },
  { id: 'left-arm',    label: 'Left Arm',      symptom: 'left arm pain or numbness',    x: 88, y: 30, w: 10, h: 22 },
  { id: 'right-arm',   label: 'Right Arm',     symptom: 'right arm pain or numbness',   x: 62, y: 30, w: 10, h: 22 }, 
  { id: 'stomach',     label: 'Stomach',       symptom: 'stomach pain or discomfort',   x: 68, y: 44, w: 24, h: 12 },
  { id: 'lower-back',  label: 'Lower Back',    symptom: 'lower back pain',              x: 68, y: 56, w: 24, h: 8  },
  { id: 'left-leg',    label: 'Left Leg',      symptom: 'left leg pain or swelling',    x: 80, y: 66, w: 10, h: 24 },
  { id: 'right-leg',   label: 'Right Leg',     symptom: 'right leg pain or swelling',   x: 70, y: 66, w: 10, h: 24 },
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

function detectTriage(text: string): 'emergency' | 'soon' | 'home' | null {
  if (text.includes('🚨')) return 'emergency'
  if (text.includes('📅')) return 'soon'
  if (text.includes('🏠')) return 'home'
  return null
}

// ── Markdown renderer ──────────────────────────────────────────────────
function parseBold(str: string): React.ReactNode[] {
  return str.split(/\*\*([^*]+)\*\*/g).map((p, i) =>
    i % 2 === 1 ? <strong key={i} style={{ fontWeight: 600 }}>{p}</strong> : p
  )
}

// Section config for structured responses
const SECTION_HEADERS = [
  { key: 'Possible Causes (Brief)', emoji: '🧠', cls: 'section-causes',    color: 'var(--green)' },
  { key: 'Possible Causes',         emoji: '🧠', cls: 'section-causes',    color: 'var(--green)' },
  { key: 'Why This Might',          emoji: '📊', cls: 'section-why',       color: '#818cf8' },
  { key: 'Immediate Warning Signs', emoji: '⚠️', cls: 'section-warning',   color: '#fbbf24' },
  { key: 'When to See',             emoji: '⚠️', cls: 'section-warning',   color: '#fbbf24' },
  { key: 'What You Can Do',         emoji: '💡', cls: 'section-do',        color: '#34d399' },
  { key: 'What to Do Right Now',    emoji: '📞', cls: 'section-steps',     color: '#60a5fa' },
  { key: 'Important',               emoji: '📌', cls: 'section-note',      color: 'var(--muted)' },
  { key: 'Attention Needed',        emoji: '🚨', cls: 'section-emergency', color: '#f87171' },
]

function isSectionHeader(line: string): { emoji: string; cls: string; color: string; header: string } | null {
  for (const s of SECTION_HEADERS) {
    if (line.includes(s.key)) {
      return { emoji: s.emoji, cls: s.cls, color: s.color, header: line.trim() }
    }
  }
  return null
}

function parseBulletList(items: string[]): React.ReactNode {
  return (
    <ul style={{ margin: '4px 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
      {items.map((b, i) => (
        <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, lineHeight: 1.6 }}>
          <span style={{ color: 'var(--green)', marginTop: 4, fontSize: '0.5rem', flexShrink: 0 }}>●</span>
          <span style={{ fontSize: '0.845rem' }}>{parseBold(b)}</span>
        </li>
      ))}
    </ul>
  )
}

function RenderContent({ text, streaming }: { text: string; streaming?: boolean }) {
  const lines = text.split('\n')

  // Severity tag
  let severityEl: React.ReactNode = null
  if (text.includes('🟢 Mild'))          severityEl = <div className="severity-mild">🟢 Mild</div>
  else if (text.includes('🟡 Moderate')) severityEl = <div className="severity-moderate">🟡 Moderate</div>
  else if (text.includes('🔴 High Risk'))severityEl = <div className="severity-high">🔴 High Risk</div>

  // Detect structured by keyword match
  const isStructured = SECTION_HEADERS.some(s => text.includes(s.key))

  if (!isStructured) {
    const out: React.ReactNode[] = []
    const bullets: string[] = []
    const flush = (k: string) => {
      if (!bullets.length) return
      const items = [...bullets]; bullets.length = 0
      out.push(<div key={k}>{parseBulletList(items)}</div>)
    }
    lines.forEach((line, i) => {
      const t = line.trim()
      if (!t) { flush('b' + i); out.push(<div key={'s' + i} style={{ height: 3 }} />); return }
      if (t.startsWith('- ') || (t.startsWith('* ') && !t.startsWith('**'))) { bullets.push(t.slice(2)); return }
      if (t === '*' || t === '-' || t === '•') return
      if (t.startsWith('🚨') || t.startsWith('📅') || t.startsWith('🏠') || t.startsWith('🟢') || t.startsWith('🟡') || t.startsWith('🔴')) return
      if (t.startsWith('*') && !t.startsWith('**') && t.endsWith('*') && t.length > 2) {
        flush('di' + i)
        out.push(<p key={i} style={{ fontSize: '0.72rem', opacity: 0.38, fontStyle: 'italic', margin: '6px 0 0' }}>{t.slice(1,-1)}</p>)
        return
      }
      flush('p' + i)
      out.push(<p key={i} style={{ lineHeight: 1.65, margin: '2px 0', fontSize: '0.875rem' }}>{parseBold(t)}</p>)
    })
    flush('end')
    return (
      <div className={streaming ? 'streaming-cursor' : ''} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {out}
      </div>
    )
  }

  type Sec = { emoji: string; cls: string; color: string; header: string; bullets: string[]; prose: string[] }
  const sections: Sec[] = []
  let cur: Sec | null = null

  lines.forEach(line => {
    const t = line.trim()
    if (!t) return
    if (t === '🚨 EMERGENCY — Seek immediate care' || t === '📅 See a doctor soon' || t === '🏠 Manageable at home' || t === '🟢 Mild' || t === '🟡 Moderate' || t === '🔴 High Risk') return
    const secMatch = isSectionHeader(t)
    if (secMatch) {
      if (cur) sections.push(cur)
      cur = { ...secMatch, bullets: [], prose: [] }
      return
    }
    if (!cur) return
    if (t.startsWith('- ')) { cur.bullets.push(t.slice(2)); return }
    if (t.startsWith('* ') && !t.startsWith('**')) { cur.bullets.push(t.slice(2)); return }
    if (t !== '*' && t !== '-' && t !== '•') cur.prose.push(t)
  })
  if (cur) sections.push(cur)

  return (
    <div className={streaming ? 'streaming-cursor' : ''} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {severityEl}
      {sections.map((sec, i) => (
        <div key={i} className={'response-section ' + sec.cls}>
          <div className="section-header" style={{ color: sec.color }}>{sec.header}</div>
          {sec.bullets.length > 0 && parseBulletList(sec.bullets)}
          {sec.prose.map((p, j) => (
            <p key={j} className="section-body" style={{ margin: '3px 0' }}>{parseBold(p)}</p>
          ))}
        </div>
      ))}
    </div>
  )
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

// ── Find doctor ─────────────────────────────────────────────────────────
// Map symptoms to relevant doctor specialty
function getDoctorSpecialty(msgs: Message[]): string {
  const allText = msgs.map(m => m.content).join(' ').toLowerCase()

  // Order matters — most specific first, general last
  // Emergency / cardiac
  if (/chest pain|chest tightness|heart attack|palpitation|arm numb|arm numbness|cardiac/.test(allText))
    return 'cardiologist'

  // Respiratory — only if explicit breathing/lung symptoms
  if (/shortness of breath|difficulty breathing|cant breathe|can't breathe|asthma|wheezing|lung/.test(allText))
    return 'pulmonologist'

  // Neuro — headache is neuro, NOT pulmo
  if (/headache|migraine|head pain|dizzy|dizziness|seizure|fainting|memory loss|numbness in face/.test(allText))
    return 'neurologist'

  // Stomach / digestive
  if (/stomach|abdomen|abdominal|nausea|vomiting|bowel|diarrhea|constipation|acid reflux|digestive/.test(allText))
    return 'gastroenterologist'

  // Skin
  if (/skin rash|rash|itch|itching|acne|eczema|hives|skin problem/.test(allText))
    return 'dermatologist'

  // ENT — throat/ear/nose/sinus
  if (/sore throat|throat pain|ear pain|earache|hearing|runny nose|blocked nose|sinus|tonsil/.test(allText))
    return 'ENT specialist'

  // Bones / joints
  if (/joint pain|knee pain|back pain|bone pain|arthritis|sprain|fracture|muscle pain/.test(allText))
    return 'orthopedic doctor'

  // Hormones / metabolism
  if (/diabetes|blood sugar|thyroid|weight gain|weight loss|hormone|fatigue with weight/.test(allText))
    return 'endocrinologist'

  // Eyes
  if (/eye pain|blurry vision|vision loss|eye infection|redness in eye/.test(allText))
    return 'ophthalmologist'

  // Mental health
  if (/anxiety|depression|panic attack|mental health|stress|insomnia|sleep disorder/.test(allText))
    return 'psychiatrist'

  // Urinary
  if (/urine|urination|kidney|bladder|burning while peeing/.test(allText))
    return 'urologist'

  // Child
  if (/child|infant|baby|toddler|pediatric/.test(allText))
    return 'pediatrician'

  // Fever alone or general symptoms → physician / general practitioner
  return 'physician'
}

function FindDoctorBtn({ level, msgs }: { level: 'soon' | 'emergency'; msgs: Message[] }) {
  const [busy, setBusy] = useState(false)
  const emergency = level === 'emergency'
  const specialty = emergency ? 'emergency hospital' : getDoctorSpecialty(msgs)

  const go = () => {
    setBusy(true)
    const q = emergency ? 'emergency hospital near me' : specialty + ' near me'
    const open = (lat?: number, lng?: number) => {
      window.open(
        `https://www.google.com/maps/search/${encodeURIComponent(q)}` + (lat ? `/@${lat},${lng},14z` : ''),
        '_blank'
      )
      setBusy(false)
    }
    navigator.geolocation
      ? navigator.geolocation.getCurrentPosition(
          p => open(p.coords.latitude, p.coords.longitude),
          () => open(), { timeout: 5000 }
        )
      : open()
  }

  const btnLabel = busy ? '📍 Locating…'
    : emergency ? '🏥 Find nearest ER'
    : `📍 Find ${specialty} nearby`

  return (
    <button onClick={go} disabled={busy} className="find-doctor-btn" style={{
      borderColor: emergency ? 'var(--badge-err-border)' : 'var(--green-border)',
      background:  emergency ? 'var(--badge-err-bg)' : 'var(--green-glow)',
      color:       emergency ? 'var(--badge-err-text)' : 'var(--green)',
    }}>
      {btnLabel}
      {!busy && <span style={{ fontSize: '0.65rem', opacity: 0.5 }}>↗</span>}
    </button>
  )
}

// ── Emergency overlay ──────────────────────────────────────────────────
function EmergencyOverlay({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.93)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(12px)', animation: 'fadeIn 0.25s ease' }}>
      <div style={{ background: '#150a0a', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 22, padding: '40px 28px', maxWidth: 440, width: '100%', textAlign: 'center', animation: 'scaleIn 0.35s cubic-bezier(0.16,1,0.3,1)', position: 'relative' }}>
        <button onClick={onDismiss} style={{ position: 'absolute', top: 14, right: 14, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(255,255,255,0.45)', fontSize: '0.9rem', fontFamily: 'var(--font-body)' }}>✕</button>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(248,113,113,0.1)', border: '2px solid rgba(248,113,113,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, margin: '0 auto 20px', animation: 'pulseGlow 1.5s ease-in-out infinite' }}>🚨</div>
        <h2 style={{ color: '#f87171', fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 700, margin: '0 0 10px' }}>Seek Emergency Care</h2>
        <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.875rem', lineHeight: 1.7, margin: '0 0 28px' }}>Your symptoms may require immediate attention. Please call emergency services or go to your nearest emergency room now.</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
          <a href="tel:112" style={{ background: '#ef4444', color: 'white', borderRadius: 12, padding: '12px 24px', fontWeight: 700, fontSize: '0.95rem', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 18px rgba(239,68,68,0.3)' }}>📞 Call 112</a>
          <a href="tel:911" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '12px 24px', fontWeight: 700, fontSize: '0.95rem', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>📞 Call 911</a>
        </div>
        <button onClick={onDismiss} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.28)', fontSize: '0.74rem', cursor: 'pointer', fontFamily: 'var(--font-body)', textDecoration: 'underline' }}>I understand, continue reading</button>
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

// 💬 Follow-up suggestion chips ─────────────────────────────────────────
function FollowUpChips({ triage, onSelect }: { triage: 'emergency' | 'soon' | 'home' | null; onSelect: (v: string) => void }) {
  const chips = triage === 'emergency' ? FOLLOWUP_EMERGENCY
    : triage === 'soon' ? FOLLOWUP_SOON
    : triage === 'home' ? FOLLOWUP_HOME
    : FOLLOWUP_CLARIFY

  return (
    <div className="scale-in" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
      {chips.map(c => (
        <button key={c} className="chip" onClick={() => onSelect(c)}
          style={{ padding: '5px 12px', fontSize: '0.76rem', minHeight: 30 }}>
          {c}
        </button>
      ))}
    </div>
  )
}

// ── Message bubble ─────────────────────────────────────────────────────
function Bubble({ msg, isWelcome, isLast, onFollowUp, msgs }: {
  msg: Message; isWelcome?: boolean; isLast?: boolean; onFollowUp?: (v: string) => void; msgs?: Message[]
}) {
  const isUser = msg.role === 'user'
  const triage = !msg.streaming ? detectTriage(msg.content) : null

  return (
    <div className="msg-appear" style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexDirection: isUser ? 'row-reverse' : 'row' }}>
      {!isUser && <div className={`avatar ${isWelcome ? 'pulse-glow' : ''}`} style={{ flexShrink: 0 }}>C</div>}
      <div style={{ maxWidth: '75%', display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', gap: 5 }}>
        <div className={isUser ? 'bubble-user' : isWelcome ? 'bubble-welcome' : 'bubble-bot'}>
          {isUser
            ? <span style={{ fontSize: '0.875rem', lineHeight: 1.6 }}>{msg.content}</span>
            : <RenderContent text={msg.content} streaming={msg.streaming} />
          }
        </div>
        {triage && !isUser && !msg.streaming && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, width: '100%' }}>
            <TriageBadge level={triage} />
            {(triage === 'soon' || triage === 'emergency') && <FindDoctorBtn level={triage} msgs={msgs || []} />}
            {/* 📄 Download report inline — mobile only, hidden on desktop via CSS */}
            {isLast && msgs && msgs.length > 2 && (
              <div className="download-mobile-only" style={{ width: '100%' }}>
                <DownloadReportBtn msgs={msgs} inline={true} />
              </div>
            )}
          </div>
        )}
        {/* 💬 Follow-up chips on last bot message only */}
        {isLast && !isUser && !msg.streaming && onFollowUp && (
          <FollowUpChips triage={triage} onSelect={onFollowUp} />
        )}
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

// 🫀 Body Map ───────────────────────────────────────────────────────────
function BodyMap({ onSelect }: { onSelect: (symptom: string) => void }) {
  const [hovered, setHovered] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

  const handle = (part: typeof BODY_PARTS[0]) => {
    setSelected(part.id)
    setTimeout(() => { onSelect(`I have ${part.symptom}`); setSelected(null) }, 300)
  }

  return (
    <div style={{ textAlign: 'center' }}>
      <p style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
        Or tap where it hurts
      </p>
      <div style={{ position: 'relative', width: 160, height: 320, margin: '0 auto' }}>
        {/* Body silhouette SVG */}
        <svg viewBox="0 0 160 320" style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}>
          {/* Head */}
          <ellipse cx="80" cy="28" rx="22" ry="26" fill="var(--bg-elevated)" stroke="var(--border)" strokeWidth="1.5"/>
          {/* Neck */}
          <rect x="72" y="52" width="16" height="12" rx="4" fill="var(--bg-elevated)" stroke="var(--border)" strokeWidth="1.5"/>
          {/* Torso */}
          <rect x="52" y="62" width="56" height="80" rx="10" fill="var(--bg-elevated)" stroke="var(--border)" strokeWidth="1.5"/>
          {/* Left arm */}
          <rect x="108" y="65" width="18" height="60" rx="9" fill="var(--bg-elevated)" stroke="var(--border)" strokeWidth="1.5"/>
          {/* Right arm */}
          <rect x="34" y="65" width="18" height="60" rx="9" fill="var(--bg-elevated)" stroke="var(--border)" strokeWidth="1.5"/>
          {/* Left leg */}
          <rect x="82" y="142" width="22" height="80" rx="11" fill="var(--bg-elevated)" stroke="var(--border)" strokeWidth="1.5"/>
          {/* Right leg */}
          <rect x="56" y="142" width="22" height="80" rx="11" fill="var(--bg-elevated)" stroke="var(--border)" strokeWidth="1.5"/>

          {/* Clickable hotspots */}
          {BODY_PARTS.map(part => {
            const isHov = hovered === part.id
            const isSel = selected === part.id
            return (
              <rect
                key={part.id}
                x={`${part.x}%`} y={`${part.y}%`}
                width={`${part.w}%`} height={`${part.h}%`}
                rx="6"
                fill={isSel ? 'rgba(34,197,94,0.4)' : isHov ? 'rgba(34,197,94,0.2)' : 'transparent'}
                stroke={isHov || isSel ? 'var(--green)' : 'transparent'}
                strokeWidth="1.5"
                style={{ cursor: 'pointer', transition: 'all 0.15s ease' }}
                onMouseEnter={() => setHovered(part.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => handle(part)}
              />
            )
          })}
        </svg>

        {/* Tooltip */}
        {hovered && (
          <div style={{
            position: 'absolute', top: -32, left: '50%', transform: 'translateX(-50%)',
            background: 'var(--bg-card)', border: '1px solid var(--green-border)',
            color: 'var(--green)', borderRadius: 8, padding: '4px 10px',
            fontSize: '0.72rem', fontWeight: 600, whiteSpace: 'nowrap',
            boxShadow: 'var(--shadow-md)', pointerEvents: 'none',
            animation: 'fadeIn 0.15s ease',
          }}>
            {BODY_PARTS.find(p => p.id === hovered)?.label}
          </div>
        )}
      </div>
    </div>
  )
}

// 📄 Symptom Report ────────────────────────────────────────────────────
function DownloadReportBtn({ msgs, inline = false }: { msgs: Message[]; inline?: boolean }) {
  const generate = () => {
    const userMsgs = msgs.filter(m => m.role === 'user')
    const botMsgs  = msgs.filter(m => m.role === 'assistant' && !m.streaming)
    const lastBot  = botMsgs[botMsgs.length - 1]
    const triage   = lastBot ? detectTriage(lastBot.content) : null

    const triageLabel = triage === 'emergency' ? '🚨 EMERGENCY — Seek immediate care'
      : triage === 'soon' ? '📅 See a doctor soon'
      : triage === 'home' ? '🏠 Manageable at home'
      : 'Not yet assessed'

    const symptoms = userMsgs.map(m => `• ${m.content}`).join('\n')
    const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

    // Strip markdown for plain text report
    const cleanText = (t: string) => t
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/^[🚨📅🏠].*/gm, '')
      .replace(/- /g, '• ')
      .trim()

    const assessment = botMsgs.slice(1).map(m => cleanText(m.content)).join('\n\n')

    const report = `CARELENS SYMPTOM REPORT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Generated: ${date}
carelens-hazel.vercel.app
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SYMPTOMS DESCRIBED
──────────────────
${symptoms}

ASSESSMENT SUMMARY
──────────────────
${assessment}

TRIAGE RECOMMENDATION
─────────────────────
${triageLabel}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DISCLAIMER: This report is generated by CareLens, an AI symptom 
clarifier. It is NOT a medical diagnosis. Always consult a qualified 
healthcare professional before making medical decisions.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`

    const blob = new Blob([report], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `carelens-report-${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <button onClick={generate} className={inline ? 'btn-ghost scale-in' : 'btn-ghost scale-in'}
      style={{
        padding: inline ? '9px 16px' : '7px 14px',
        fontSize: '0.78rem', borderRadius: 10, gap: 6,
        display: 'flex', alignItems: 'center',
        width: inline ? '100%' : 'auto',
        justifyContent: inline ? 'center' : 'flex-start',
      }}>
      <span>📄</span>
      <span>{inline ? 'Download your report' : 'Download Report'}</span>
    </button>
  )
}

// ⌨️ Animated placeholder phrases
// ⌨️ Animated placeholder ──────────────────────────────────────────────
function useAnimatedPlaceholder() {
  const [idx, setIdx] = useState(0)
  const [displayed, setDisplayed] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const target = PLACEHOLDERS[idx]
    if (!deleting) {
      if (displayed.length < target.length) {
        const t = setTimeout(() => setDisplayed(target.slice(0, displayed.length + 1)), 60)
        return () => clearTimeout(t)
      } else {
        const t = setTimeout(() => setDeleting(true), 2200)
        return () => clearTimeout(t)
      }
    } else {
      if (displayed.length > 0) {
        const t = setTimeout(() => setDisplayed(displayed.slice(0, -1)), 30)
        return () => clearTimeout(t)
      } else {
        setDeleting(false)
        setIdx(i => (i + 1) % PLACEHOLDERS.length)
      }
    }
  }, [displayed, deleting, idx])

  return displayed
}

// ── Landing ────────────────────────────────────────────────────────────
function Landing({ onSend }: { onSend: (t: string) => void }) {
  const [val, setVal] = useState('')
  const [showMap, setShowMap] = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const placeholder = useAnimatedPlaceholder()

  useEffect(() => {
    const ta = taRef.current
    if (ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 100) + 'px' }
  }, [val])

  const submit = () => { if (val.trim()) onSend(val.trim()) }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '28px 20px 20px', maxWidth: 580, margin: '0 auto', width: '100%' }}>

      <div className="floating fade-up" style={{ marginBottom: 18 }}>
        <div style={{ width: 76, height: 76, borderRadius: 22, background: 'var(--green-glow)', border: '1px solid var(--green-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34, boxShadow: 'var(--shadow-green)' }}>🩺</div>
      </div>

      <div className="fade-up fade-up-1" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--green-glow)', border: '1px solid var(--green-border)', color: 'var(--green)', borderRadius: 100, padding: '5px 14px', fontSize: '0.72rem', fontWeight: 600, marginBottom: 16 }}>
        ✦ AI-powered · Not a diagnosis
      </div>

      <h1 className="fade-up fade-up-2" style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.9rem, 5.5vw, 2.9rem)', fontWeight: 700, margin: '0 0 12px', lineHeight: 1.1, textAlign: 'center', letterSpacing: '-0.02em' }}>
        <span style={{ color: 'var(--text)' }}>Understand your </span>
        <span style={{ color: 'var(--green)' }}>symptoms</span>
      </h1>

      <p className="fade-up fade-up-3" style={{ color: 'var(--subtext)', fontSize: '0.95rem', maxWidth: 360, margin: '0 auto 24px', lineHeight: 1.7, textAlign: 'center' }}>
        Plain-English clarity on what your body might be telling you — plus what to do next.
      </p>

      {/* Input card */}
      <div className="hero-card fade-up fade-up-3" style={{ width: '100%', marginBottom: 14, padding: '16px 16px 14px' }}>
        <textarea
          ref={taRef}
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
          placeholder={placeholder || 'Describe your symptoms…'}
          rows={2}
          className="cl-input"
          style={{ padding: '11px 14px', fontSize: '0.93rem', lineHeight: 1.6, marginBottom: 10, borderRadius: 12 }}
          autoFocus
        />
        <button className="btn-primary" onClick={submit} disabled={!val.trim()} style={{ width: '100%', padding: '12px 20px', fontSize: '0.92rem', borderRadius: 12 }}>
          Analyze Symptoms →
        </button>
      </div>

      {/* Toggle between chips and body map */}
      <div className="fade-up fade-up-4" style={{ width: '100%', textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 14 }}>
          <button onClick={() => setShowMap(false)} className="btn-ghost" style={{
            padding: '5px 14px', fontSize: '0.76rem', borderRadius: 100,
            borderColor: !showMap ? 'var(--green)' : 'var(--border)',
            color: !showMap ? 'var(--green)' : 'var(--subtext)',
            background: !showMap ? 'var(--green-glow)' : 'transparent',
          }}>
            💬 Symptoms
          </button>
          <button onClick={() => setShowMap(true)} className="btn-ghost" style={{
            padding: '5px 14px', fontSize: '0.76rem', borderRadius: 100,
            borderColor: showMap ? 'var(--green)' : 'var(--border)',
            color: showMap ? 'var(--green)' : 'var(--subtext)',
            background: showMap ? 'var(--green-glow)' : 'transparent',
          }}>
            🫀 Body Map
          </button>
        </div>

        {!showMap ? (
          <div className="fade-in">
            <p style={{ fontSize: '0.65rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 9 }}>Quick start</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, justifyContent: 'center' }}>
              {QUICK_SYMPTOMS.map(({ label, icon }) => (
                <button key={label} className="chip" onClick={() => onSend(label)} style={{ padding: '7px 14px', fontSize: '0.8rem' }}>
                  {icon} {label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="fade-in">
            <BodyMap onSelect={s => { setVal(s); setShowMap(false); taRef.current?.focus() }} />
          </div>
        )}
      </div>

      <p className="disclaimer fade-up fade-up-5" style={{ marginTop: 22 }}>
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
  const taRef       = useRef<HTMLTextAreaElement>(null)
  const tmrRef      = useRef<ReturnType<typeof setInterval> | null>(null)
  const tlClickRef  = useRef(false)

  useEffect(() => {
    applyTheme(theme)
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      const h = () => applyTheme('system')
      mq.addEventListener('change', h); return () => mq.removeEventListener('change', h)
    }
  }, [theme])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, busy])

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

  const updateTimeline = (val: string) => {
    const botHasReplied = msgs.filter(m => m.role === 'assistant').length > 1
    const alreadyAnsweredTime = msgs.filter(m => m.role === 'user')
      .some(m => /\b(day|days|week|weeks|month|months|hour|hours|since|ago|yesterday|today|morning|night|started|begin|began)\b/i.test(m.content))
    const hasContent = val.length > 6
    const hasTimeInInput = /\b(day|days|week|weeks|month|months|hour|hours|since|ago|yesterday|today|morning|night|started|begin|began)\b/i.test(val)
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
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Request failed')
      }
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
    } catch (e: unknown) {
      stopThink(); setBusy(false)
      const msg = (e instanceof Error && e.message) ? e.message : 'Something went wrong. Try again.'
      setErr(msg)
    }
  }, [input, busy, msgs, inChat])

  const appendTimeline = (value: string) => {
    setInput(p => { const base = p.trimEnd(); return base ? base + ' ' + value : value })
    setShowTL(false); taRef.current?.focus()
  }

  const reset = () => { setMsgs([]); setChat(false); setErr(null); setInput(''); setOver(false); setShowTL(false) }

  const charCount = input.length
  const charCls = charCount > 450 ? 'limit' : charCount > 350 ? 'warn' : ''
  const userMsgCount = msgs.filter(m => m.role === 'user').length
  const lastBotTriage = (() => {
    const lastBot = [...msgs].reverse().find(m => m.role === 'assistant' && !m.streaming)
    return lastBot ? detectTriage(lastBot.content) : null
  })()
  const hasAssessment = lastBotTriage !== null

  return (
    <div className="mesh-bg">
      {overlay && <EmergencyOverlay onDismiss={() => setOver(false)} />}

      {/* HEADER */}
      <header className="header" style={{ padding: '0 20px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: inChat ? 'pointer' : 'default' }} onClick={inChat ? reset : undefined}>
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
          {/* 📄 Download report — header on desktop, inline on mobile */}
          {inChat && hasAssessment && (
            <div className="download-desktop-only">
              <DownloadReportBtn msgs={msgs} />
            </div>
          )}
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
              <Bubble
                key={i} msg={msg}
                isWelcome={i === 0 && msg.role === 'assistant'}
                isLast={i === msgs.length - 1}
                onFollowUp={txt => { setInput(txt); setTimeout(() => send(txt), 100) }}
                msgs={msgs}
              />
            ))}
            {busy && <TypingDots msg={thinking} />}
            {err && (
              <div className="error-banner">
                <span>⚠️</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>Something went wrong</div>
                  <div style={{ fontSize: '0.78rem', opacity: 0.75, marginTop: 2 }}>Check your connection and try again.</div>
                </div>
                <button onClick={() => setErr(null)} className="btn-ghost" style={{ padding: '4px 10px', fontSize: '0.74rem', borderRadius: 7, flexShrink: 0 }}>✕</button>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Scroll to top */}
          {showScrollTop && (
            <button onClick={() => messagesRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
              style={{ position: 'fixed', bottom: 100, right: 24, zIndex: 40, width: 38, height: 38, borderRadius: '50%', background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--subtext)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '1rem', boxShadow: 'var(--shadow-md)', transition: 'all 0.2s ease', animation: 'fadeIn 0.2s ease' }}
              title="Scroll to top">↑</button>
          )}

          {/* INPUT */}
          <div className="input-sticky">
            <div className="input-wrapper">
              {showTL && (
                <div className="slide-down" style={{ padding: '9px 13px 8px', borderBottom: '1px solid var(--border)' }}
                  onMouseDown={() => { tlClickRef.current = true }}>
                  <span style={{ fontSize: '0.64rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>⏱ When did it start?</span>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                    {TIMELINE_OPTIONS.map(({ label, value }) => (
                      <button key={label} className="chip"
                        onMouseDown={e => { e.preventDefault(); appendTimeline(value) }}
                        style={{ padding: '5px 12px', fontSize: '0.76rem', minHeight: 30 }}>{label}</button>
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
                  onBlur={() => { if (tlClickRef.current) { tlClickRef.current = false; return }; setTimeout(() => setShowTL(false), 100) }}
                  placeholder="Describe your symptoms or reply here…"
                  rows={1} maxLength={500}
                  style={{ width: '100%', padding: '1px 4px', fontSize: '0.875rem', lineHeight: 1.55, minHeight: 26, background: 'transparent', color: 'var(--text)', outline: 'none', resize: 'none', fontFamily: 'var(--font-body)' }}
                />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 7 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="keyboard-hint" style={{ fontSize: '0.67rem', color: 'var(--muted)' }}>Enter to send · Shift+Enter for new line</span>
                    {charCount > 0 && <span className={`char-counter ${charCls}`}>{charCount}/500</span>}
                  </div>
                  <button className="btn-primary" onClick={() => send()} disabled={!input.trim() || busy}
                    style={{ padding: '9px 18px', fontSize: '0.85rem', borderRadius: 10, minHeight: 38, gap: 8 }}>
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