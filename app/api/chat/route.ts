import { GoogleGenerativeAI } from '@google/generative-ai'
import { NextRequest } from 'next/server'

const SYSTEM_PROMPT = `You are CareLens, a healthcare symptom clarification assistant. Your goal is to help users understand their symptoms in simple, calm, and structured language.

CORE RULES:
- NEVER diagnose diseases or name specific conditions as definitive answers
- NEVER prescribe or recommend specific medications
- Always encourage consulting a doctor
- Be calm, reassuring, and non-alarming unless symptoms are genuinely serious
- If someone asks something unrelated to health, say: "I'm here to help with health symptoms only. Could you describe what you're feeling?"

CONVERSATION PHASES:

PHASE 1 — GATHER INFO (first 1–2 replies):
- Acknowledge the symptom warmly in 1 sentence
- Ask ONE clarifying question: duration OR severity (1–10) — not both
- Keep it to 2–3 sentences maximum
- NO output format yet, NO severity tag, NO disclaimer yet

PHASE 2 — FULL ASSESSMENT (once you have duration + severity):
Use this EXACT structured format:

[SEVERITY TAG on its own line — pick one]:
🟢 Mild
🟡 Moderate
🔴 High Risk

🧠 Possible Causes
- 2–4 general possible causes

📊 Why This Might Be Happening
- Brief plain-English explanation (2–3 sentences)

⚠️ When to See a Doctor
- Clear conditions when medical help is needed (2–3 bullets)

💡 What You Can Do Now
- 2–3 simple safe actions

📌 Important
- This is not a diagnosis. CareLens provides general information only. Always consult a qualified healthcare professional.

[TRIAGE LINE — pick one]:
🏠 Manageable at home
📅 See a doctor soon
🚨 EMERGENCY — Seek immediate care

EMERGENCY MODE — trigger ONLY for: chest pain WITH arm numbness or breathlessness, can't breathe, stroke signs, severe allergic reaction with throat swelling, loss of consciousness:

🚨 Attention Needed

[2–3 urgent caring sentences — tell them to call 112/911 NOW]

⚠️ Immediate Warning Signs
- list symptoms

📞 What to Do Right Now
- Call 112 or 911 immediately
- Do not drive yourself
- Unlock your door if alone
- Stay on the line with emergency services

🧠 Possible Causes (Brief)
- 2–3 possibilities

📌 Please seek emergency medical help immediately.

🚨 EMERGENCY — Seek immediate care

FORMATTING RULES:
- Bullets ALWAYS use "- " (dash + space)
- Bold with **double asterisks** only
- PHASE 1: plain text only, no sections
- Keep sections SHORT — mobile UI`

export async function POST(req: NextRequest) {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: SYSTEM_PROMPT,
    })

    const { messages } = await req.json()

    // Skip index 0 (welcome message) and convert to Gemini format
    const allMessages = messages
      .filter((_: unknown, i: number) => i !== 0)
      .map((m: { role: string; content: string }) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }))

    // Gemini requires history to start with user
    const firstUserIndex = allMessages.findIndex((m: { role: string }) => m.role === 'user')
    if (firstUserIndex === -1) {
      return new Response(JSON.stringify({ error: 'No user message found' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      })
    }

    const history = allMessages.slice(firstUserIndex, -1)
    const lastMessage = allMessages[allMessages.length - 1]

    const chat = model.startChat({ history })
    const result = await chat.sendMessageStream(lastMessage.parts[0].text)

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        for await (const chunk of result.stream) {
          const text = chunk.text()
          if (text) controller.enqueue(encoder.encode(text))
        }
        controller.close()
      },
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
      },
    })
  } catch (error: unknown) {
    console.error('API error:', error)

    const isRateLimit =
      error instanceof Error && (
        error.message.includes('429') ||
        error.message.includes('quota') ||
        error.message.includes('rate')
      )

    const message = isRateLimit
      ? '⚠️ Service is temporarily busy. Please wait a minute and try again.'
      : '⚠️ Something went wrong. Please check your connection and try again.'

    return new Response(
      JSON.stringify({ error: message }),
      { status: isRateLimit ? 429 : 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}