# CareLens — Symptom Clarifier

> Understand what your body is telling you, in plain English.

**Live demo:** [carelens-hazel.vercel.app](https://carelens-hazel.vercel.app)  
**Built for:** Thinkly Labs — Software Engineering Assignment

---

## What is CareLens?

CareLens is a purpose-built AI symptom clarifier — not a generic chat wrapper. It helps everyday users understand their symptoms in plain English and tells them exactly what to do next: manage at home, see a doctor, or call emergency services.

The experience is designed around the user's journey, not just around the AI response.

---

## Why I picked this topic

Healthcare communication is broken. People Google symptoms and spiral into anxiety. Doctors are overwhelmed. CareLens bridges the gap — it gives users clarity, not a diagnosis, and a clear next step instead of a wall of medical jargon.

---

## Features

### 🧠 Two-phase conversation design
Not a generic "ask anything" wrapper. CareLens follows a deliberate flow:
- **Phase 1** — Gathers info (duration, severity) with one question at a time
- **Phase 2** — Delivers a structured assessment with sections, severity tag, and triage recommendation

### 🟢🟡🔴 Severity tagging
Every assessment starts with a clear severity indicator — Mild, Moderate, or High Risk — so users know immediately how serious their situation is.

### 🗂️ Structured response cards
Responses are broken into labelled sections:
- 🧠 Possible Causes
- 📊 Why This Might Be Happening
- ⚠️ When to See a Doctor
- 💡 What You Can Do Now
- 📌 Important disclaimer

### 🚨 Emergency mode
If symptoms suggest a cardiac event, stroke, or breathing emergency, CareLens immediately switches to a full-screen emergency overlay with direct call buttons (112 / 911) — no clarifying questions asked.

### 📍 Specialty-aware doctor finder
The "Find a doctor" button doesn't just search "GP near me." It reads the conversation and searches for the right specialist — cardiologist, neurologist, gastroenterologist, dermatologist, and more — using the browser's Geolocation API and Google Maps deep links.

### 🫀 Interactive body map
On the landing page, users can toggle to a clickable SVG body silhouette. Tap where it hurts — head, chest, stomach, arms, legs — and it pre-fills the symptom input automatically.

### 💬 Follow-up suggestion chips
After every bot response, context-aware quick reply chips appear. After a 🏠 response: "What can I do at home?" After 📅: "What should I tell my doctor?" After 🚨: "What do I do while waiting for help?"

### 📄 Symptom report download
Once an assessment is complete, users can download a structured `.txt` report with their symptoms, assessment summary, triage level, and disclaimer — something they can bring to an actual doctor's appointment.

### ⌨️ Animated placeholder
The landing input cycles through symptom examples with a typewriter effect — making the empty state feel alive and guiding users on how to start.

### ⏱️ Timeline quick-picker
After the bot asks "how long have you had this?", smart duration chips appear (Today / 2–3 days / 1 week / 1 month+) — reducing friction and helping users give better context.

### 🎨 Light / Dark / System themes
Full theme support with smooth transitions. Respects the user's OS preference by default.

---

## Product decisions

### Why two phases?
A single-shot prompt produces generic answers. By gathering duration and severity first, the assessment is meaningfully more accurate and the UX mirrors how a real triage nurse would operate.

### Why structured cards instead of prose?
Healthcare information needs to be scannable, not read like an essay. Cards let users jump to what they care about — causes, what to do now, when to see a doctor.

### Why no login?
Every minute of friction before a user describes their symptom is a minute they might close the tab. The best health apps (Ada, WebMD) let you start immediately. Login would be the wrong call here.

### Why Groq?
Free tier, fast inference (~200ms first token), and LLaMA 3.3 70B is strong enough for structured health responses. `temperature: 0.3` keeps formatting consistent across responses.

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| AI | Groq API — LLaMA 3.3 70B Versatile |
| Styling | Tailwind CSS + custom CSS design tokens |
| Fonts | Sora (headings) + Inter (body) |
| Deployment | Vercel |
| Maps | Google Maps deep links + Geolocation API |

---

## Running locally

```bash
git clone https://github.com/Adarsh0503/Carelens
cd Carelens
npm install

# Create .env.local
echo "GROQ_API_KEY=your_key_here" > .env.local

npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

Get a free Groq API key at [console.groq.com](https://console.groq.com)

---

## Deploying to Vercel

1. Push to GitHub
2. Import repo at [vercel.com/new](https://vercel.com/new)
3. Add environment variable: `GROQ_API_KEY`
4. Deploy

---

## Project structure

```
app/
├── page.tsx          # Full UI — landing, chat, body map, all components
├── layout.tsx        # Fonts, metadata
├── globals.css       # Design tokens, theme system, component styles
└── api/
    └── chat/
        └── route.ts  # Groq streaming API + system prompt
public/
└── favicon.svg       # Stethoscope icon
```

---

## AI tools used

- **Claude (claude.ai)** — Product architecture, system prompt design, component structure, debugging
- **Groq** — LLM inference for the chatbot
- All AI output was reviewed, tested, and intentionally directed. Every product decision — topic, conversation design, triage logic, UX details — was made by me.

---

## What I'd build next

- **User accounts** with saved symptom history and conversation logs
- **Symptom severity tracker** — log pain levels over time, show a chart to bring to your doctor
- **Multilingual support** — auto-detect browser language, respond in Hindi/Spanish/French
- **Voice input** — describe symptoms hands-free

---

*CareLens is not a medical device. It provides general information only and is not a substitute for professional medical advice, diagnosis, or treatment.*