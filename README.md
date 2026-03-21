# Symply — Understand Your Symptoms

> A purpose-built symptom clarifier that explains what your body might be telling you, in plain English.

**Live demo:** [your-vercel-url.vercel.app]

---

## What I Built

Symply is a conversational symptom clarifier — not a diagnostic tool. It helps everyday users understand their symptoms in simple, jargon-free language and tells them what to do next: manage at home, see a doctor soon, or seek emergency care.

### Why this topic?

Healthcare communication is broken. Patients Google symptoms and spiral into anxiety. Symply bridges the gap between "I feel something is wrong" and "I know what to do about it" — with warmth, clarity, and responsible framing.

---

## Product Decisions

### UX Design
- **Empty state:** A welcoming hero with quick-tap symptom chips, so users never face a blank input
- **Loading state:** Animated typing indicator that feels alive, not mechanical
- **Error state:** Friendly inline error with retry prompt
- **Triage badges:** Every response ends with a colour-coded next step (🚨 Emergency / 📅 See a doctor / 🏠 Home care)
- **Disclaimer:** Persistent footer + italic end-of-message reminder — responsible by design

### System Prompt Design
The Claude system prompt is carefully constrained:
- Always asks clarifying questions before concluding
- Never uses diagnostic language ("you have X") — only probabilistic ("could suggest")
- Emergency symptoms trigger immediate escalation, no clarifying questions
- Warm, conversational tone — like a knowledgeable friend, not a medical textbook

### Visual Design
- Deep navy mesh background with mint accent — clinical but warm
- Glass morphism cards for chat bubbles
- DM Serif Display + DM Sans pairing — approachable authority
- Streaming responses for a live, real-time feel

---

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **AI:** Google Gemini 1.5 Flash (streaming)
- **Styling:** Tailwind CSS + custom CSS tokens
- **Deployment:** Vercel
- **Fonts:** DM Serif Display + DM Sans (Google Fonts)

---

## Running Locally

```bash
git clone https://github.com/yourusername/symply
cd symply
npm install
cp .env.local.example .env.local
# Add your GEMINI_API_KEY to .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Deployment

1. Push to GitHub
2. Import to [Vercel](https://vercel.com)
3. Add `GEMINI_API_KEY` in Vercel Environment Variables
4. Deploy

---

## AI Tools Used

- **Claude (claude.ai):** Product concept, system prompt design, component architecture
- **GitHub Copilot:** Inline code completion
- All AI output was reviewed, tested, and intentionally directed — not blindly accepted

---

*Symply is not a medical device. It is for informational purposes only. Always consult a qualified healthcare professional.*
