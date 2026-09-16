import OpenAI from "openai"
import { config } from "../config"

const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY })
const MIN_DURATION_SECONDS = 5 * 60
const MAX_DURATION_SECONDS = 7 * 24 * 60 * 60
const MAX_EVENT_DURATION_SECONDS = 365 * 24 * 60 * 60

export interface ParsedBetIntent {
  asset: string | null
  duration: number | null
  durationText: string | null
  confidence: number
  error: string | null
}

export interface ParsedEventIntent {
  question: string | null
  dataSourceType: "X_POST" | null
  dataSourceConfig: { username: string } | null
  duration: number | null
  durationText: string | null
  confidence: number
  error: string | null
}

export type IntentType = "price_bet" | "event_bet" | "unknown"

export interface ParsedIntent {
  type: IntentType
  priceBet?: ParsedBetIntent
  eventBet?: ParsedEventIntent
}

const SYSTEM_PROMPT = `You are a bet parser for a multi-side crypto price betting bot. Extract the asset and duration from user messages.

Normalize assets to the format SYMBOL/USD when clear.
Support any valid CoinGecko symbol (not only major coins), for example BTC/USD, ETH/USD, LINK/USD, SOL/USD, VIRTUAL/USD, $AIR/USD, $BONK/USD.
Duration range: 5 minutes to 365 days
The user may write in English or Chinese.
Users may express duration as a relative unit ("5m", "1h"), a calendar day ("3.21", "03/21", "2026-03-21"), or natural language ("tomorrow", "明天", "后天").
If the user provides a calendar day or natural-language date without a clock time, interpret it as the same local time-of-day as now.
The user message will include a reference current time. Use that reference time when interpreting target-date phrases such as "tomorrow" or "3.21".

Return a JSON object with these fields:
- asset: normalized trading pair like "BTC/USD", or null if unclear
- duration: duration in seconds, or null. Parse "10m"=600, "1h"=3600, "1d"=86400, "10分钟"=600, "1小时"=3600
- durationText: human readable duration like "5 minutes", or null
- confidence: 0.0 to 1.0 how confident you are in the parse
- error: a brief error message if something is unclear, or null
- If the user's intention to start a game or make predictions is unclear, return false directly.

Examples:
- "BTC 10分钟" → {"asset":"BTC/USD","duration":600,"durationText":"10 minutes","confidence":0.95,"error":null}
- "开盘 LINK 1h" → {"asset":"LINK/USD","duration":3600,"durationText":"1 hour","confidence":0.95,"error":null}
- "virtual 30m" → {"asset":"VIRTUAL/USD","duration":1800,"durationText":"30 minutes","confidence":0.95,"error":null}
- "VIRTUAL in tomorrow" → {"asset":"VIRTUAL/USD","duration":86400,"durationText":"tomorrow","confidence":0.95,"error":null}
- "VIRTUAL in 3.21" → {"asset":"VIRTUAL/USD","duration":172800,"durationText":"3-days","confidence":0.9,"error":null}
- "BTC 5分钟" → {"asset":"BTC/USD","duration":300,"durationText":"5 minutes","confidence":0.95,"error":null}
- "bet on ETH" → {"asset":"ETH/USD","duration":null,"durationText":null,"confidence":0.5,"error":"Please specify a duration, e.g. 5m, 1h"}
- "BTC" → {"asset":"BTC/USD","duration":null,"durationText":null,"confidence":0.5,"error":"Please specify a duration, e.g. 5m, 1h"}

ONLY return valid JSON. No markdown, no explanation.`

interface DurationHint {
  duration: number | null
  durationText: string | null
  error: string | null
}

function formatReferenceNow(now: Date) {
  const offsetMinutes = -now.getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? "+" : "-"
  const absMinutes = Math.abs(offsetMinutes)
  const offsetHours = String(Math.floor(absMinutes / 60)).padStart(2, "0")
  const offsetRemainderMinutes = String(absMinutes % 60).padStart(2, "0")

  return [
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
    `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`,
    `UTC${sign}${offsetHours}:${offsetRemainderMinutes}`,
  ].join(" ")
}

function withCurrentLocalTime(target: Date, now: Date) {
  target.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), 0)
  return target
}

function toWholeSeconds(ms: number) {
  return Math.max(0, Math.round(ms / 1000))
}

function formatMonthDay(month: number, day: number) {
  return `${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`
}

function validateDuration(duration: number, label: string): DurationHint {
  if (duration < MIN_DURATION_SECONDS || duration > MAX_DURATION_SECONDS) {
    return {
      duration: null,
      durationText: label,
      error: `Duration must be between 5 minutes and 365 days. Parsed "${label}" outside that range.`,
    }
  }

  return { duration, durationText: label, error: null }
}

function parseCalendarDuration(message: string, now = new Date()): DurationHint | null {
  const lower = message.toLowerCase()
  const relativePatterns: Array<{ pattern: RegExp; days: number; label: string }> = [
    { pattern: /\b(day after tomorrow)\b/i, days: 2, label: "day after tomorrow" },
    { pattern: /\b(tomorrow)\b/i, days: 1, label: "tomorrow" },
    { pattern: /后天/, days: 2, label: "后天" },
    { pattern: /明天/, days: 1, label: "明天" },
  ]

  for (const item of relativePatterns) {
    if (!item.pattern.test(lower)) continue
    const target = new Date(now)
    target.setDate(target.getDate() + item.days)
    const duration = toWholeSeconds(target.getTime() - now.getTime())
    return validateDuration(duration, item.label)
  }

  const explicitDateMatch = message.match(/\b(20\d{2})[./-](\d{1,2})[./-](\d{1,2})\b/)
  if (explicitDateMatch) {
    const year = Number(explicitDateMatch[1])
    const month = Number(explicitDateMatch[2])
    const day = Number(explicitDateMatch[3])
    const target = withCurrentLocalTime(new Date(year, month - 1, day), now)
    if (
      target.getFullYear() === year &&
      target.getMonth() === month - 1 &&
      target.getDate() === day
    ) {
      const duration = toWholeSeconds(target.getTime() - now.getTime())
      return validateDuration(duration, `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`)
    }
  }

  const monthDayMatch = message.match(/(?:\bin\s+)?\b(\d{1,2})[./-](\d{1,2})\b/)
  if (monthDayMatch) {
    const month = Number(monthDayMatch[1])
    const day = Number(monthDayMatch[2])
    let year = now.getFullYear()
    let target = withCurrentLocalTime(new Date(year, month - 1, day), now)
    if (
      target.getFullYear() !== year ||
      target.getMonth() !== month - 1 ||
      target.getDate() !== day
    ) {
      return {
        duration: null,
        durationText: formatMonthDay(month, day),
        error: `Could not parse "${formatMonthDay(month, day)}" as a valid date.`,
      }
    }

    if (target.getTime() <= now.getTime()) {
      year += 1
      target = withCurrentLocalTime(new Date(year, month - 1, day), now)
    }

    const duration = toWholeSeconds(target.getTime() - now.getTime())
    return validateDuration(duration, formatMonthDay(month, day))
  }

  return null
}

function mergeDurationHint(parsed: ParsedBetIntent, hint: DurationHint | null): ParsedBetIntent {
  if (!hint) return parsed
  if (hint.error) {
    return {
      ...parsed,
      duration: null,
      durationText: hint.durationText,
      confidence: Math.min(parsed.confidence || 0.8, 0.8),
      error: hint.error,
    }
  }

  return {
    ...parsed,
    duration: hint.duration,
    durationText: hint.durationText,
    confidence: Math.max(parsed.confidence || 0, 0.9),
    error: null,
  }
}

export async function parseBetIntent(message: string): Promise<ParsedBetIntent> {
  const now = new Date()
  const durationHint = parseCalendarDuration(message)

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            `Reference current time: ${formatReferenceNow(now)}`,
            `Reference current time (ISO): ${now.toISOString()}`,
            `User message: ${message}`,
            durationHint?.duration
              ? `Deterministic duration hint: ${durationHint.duration} seconds (${durationHint.durationText}).`
              : null,
          ].filter(Boolean).join("\n"),
        },
      ],
      temperature: 0.1,
      max_tokens: 200,
    })
    console.log("OpenAI response:", response.choices[0]?.message?.content)

    const content = response.choices[0]?.message?.content?.trim()
    if (!content || content.toLowerCase() === "false") {
      return {
        asset: null, duration: null, durationText: null,
        confidence: 0, error: "No response from AI",
      }
    }

    const parsed = JSON.parse(content) as ParsedBetIntent
    return mergeDurationHint(parsed, durationHint)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    const fallback = {
      asset: null, duration: null, durationText: null,
      confidence: 0, error: `Parse error: ${errorMsg}`,
    }
    return mergeDurationHint(fallback, durationHint)
  }
}

// ============================================================
// Event bet intent parsing (fully decoupled from price bets)
// ============================================================

const CLASSIFY_SYSTEM_PROMPT = `You classify user messages for a prediction market bot. Determine the intent type.

Types:
- "price_bet": The user wants to bet on a crypto asset's price direction (mentions a coin/token + duration). Examples: "BTC 5m", "ETH tomorrow", "LINK 1h"
- "event_bet": The user asks a YES/NO question about a real-world event, especially one that can be verified from social media posts (X/Twitter). Examples: "CZ下周会公布离婚证书吗？", "Will Elon tweet about Doge?", "Trump 会发推特说Bitcoin吗？"
- "unknown": Cannot determine intent

Return ONLY one of: "price_bet", "event_bet", "unknown". No explanation.`

const EVENT_INTENT_SYSTEM_PROMPT = `You parse event prediction intents for a prediction market. Extract structured information from YES/NO event questions.

The user wants to create a prediction market for a binary (YES/NO) event. The data source is typically someone's X (Twitter) posts.

Extract:
- question: The YES/NO question (keep original language)
- dataSourceType: "X_POST" if verifiable via someone's X/Twitter posts, null otherwise
- dataSourceConfig: {"username": "x_handle_without_at"} — the X username to monitor. Use your knowledge of well-known figures to infer the correct handle. Common handles: CZ/赵长鹏 → "cz_binance", Elon Musk → "elonmusk", Trump → "realDonaldTrump", Vitalik → "VitalikButerin"
- duration: seconds until resolution deadline. Parse relative time expressions.
- durationText: human readable duration
- confidence: 0.0-1.0
- error: brief error or null

The user may write in English or Chinese.
The user message includes a reference current time for interpreting relative dates.

Examples:
- "CZ下周会公布离婚证书吗？" → {"question":"CZ下周会公布离婚证书吗？","dataSourceType":"X_POST","dataSourceConfig":{"username":"cz_binance"},"duration":604800,"durationText":"1 week","confidence":0.9,"error":null}
- "Will Elon tweet about Doge this weekend?" → {"question":"Will Elon tweet about Doge this weekend?","dataSourceType":"X_POST","dataSourceConfig":{"username":"elonmusk"},"duration":172800,"durationText":"2 days","confidence":0.9,"error":null}

ONLY return valid JSON. No markdown, no explanation.`

export async function classifyIntent(message: string): Promise<IntentType> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: CLASSIFY_SYSTEM_PROMPT },
        { role: "user", content: message },
      ],
      temperature: 0,
      max_tokens: 20,
    })

    const content = response.choices[0]?.message?.content?.trim().toLowerCase()
    if (content === "price_bet" || content === "event_bet") return content
    return "unknown"
  } catch {
    return "unknown"
  }
}

export async function parseEventIntent(message: string): Promise<ParsedEventIntent> {
  const now = new Date()

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: EVENT_INTENT_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            `Reference current time: ${formatReferenceNow(now)}`,
            `Reference current time (ISO): ${now.toISOString()}`,
            `User message: ${message}`,
          ].join("\n"),
        },
      ],
      temperature: 0.1,
      max_tokens: 300,
    })

    console.log("OpenAI event intent response:", response.choices[0]?.message?.content)

    const content = response.choices[0]?.message?.content?.trim()
    if (!content || content.toLowerCase() === "false") {
      return {
        question: null, dataSourceType: null, dataSourceConfig: null,
        duration: null, durationText: null, confidence: 0,
        error: "No response from AI",
      }
    }

    const parsed = JSON.parse(content) as ParsedEventIntent

    // Validate duration range
    if (parsed.duration !== null) {
      if (parsed.duration < MIN_DURATION_SECONDS || parsed.duration > MAX_EVENT_DURATION_SECONDS) {
        return {
          ...parsed,
          duration: null,
          confidence: Math.min(parsed.confidence, 0.3),
          error: `Duration must be between 5 minutes and 365 days.`,
        }
      }
    }

    return parsed
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    return {
      question: null, dataSourceType: null, dataSourceConfig: null,
      duration: null, durationText: null, confidence: 0,
      error: `Parse error: ${errorMsg}`,
    }
  }
}

// ============================================================
// Prediction-market intent parsing (YES/NO threshold questions)
// ============================================================

export interface ParsedPredictionIntent {
  asset: string | null              // e.g. "BTC/USD"
  threshold: number | null          // human-readable, e.g. 150000
  direction: "above" | "below" | null
  durationSeconds: number | null
  durationText: string | null
  confidence: number
  error: string | null
}

const PREDICTION_INTENT_SYSTEM_PROMPT = `You parse YES/NO crypto-price prediction questions for a prediction market.

The user writes a question like "Will BTC break 150k before July 1?" and you must extract:
- asset: normalized SYMBOL/USD trading pair (BTC/USD, ETH/USD, LINK/USD, SOL/USD, etc.)
- threshold: the price target as a plain number (no thousands separators, no units). "150k" → 150000, "1.5 million" → 1500000, "$4,000" → 4000.
- direction: "above" if YES means price ≥ threshold ("break", "above", "hit", "突破", "超过"); "below" if YES means price ≤ threshold ("under", "below", "stay under", "跌破", "低于").
- durationSeconds: seconds from now until the resolution time. Parse relative ("in 7 days" → 604800) and calendar ("before July 1" → seconds until July 1 at current local time-of-day) phrases.
- durationText: human-readable label of the duration ("7 days", "until 2026-07-01").
- confidence: 0.0 to 1.0.
- error: brief error if any field cannot be inferred, else null.

The user message includes a reference current time you must use when interpreting "tomorrow", "next week", or a bare date.
The user may write in English or Chinese.

Return a JSON object. ONLY valid JSON, no markdown, no explanation.

Examples:
- "Will BTC break 150k before July 1?" → {"asset":"BTC/USD","threshold":150000,"direction":"above","durationSeconds":<until July 1>,"durationText":"until 2026-07-01","confidence":0.95,"error":null}
- "Will ETH stay under 4000 by end of week?" → {"asset":"ETH/USD","threshold":4000,"direction":"below","durationSeconds":<until week-end>,"durationText":"end of week","confidence":0.9,"error":null}
- "比特币能否在7月1日前突破15万" → {"asset":"BTC/USD","threshold":150000,"direction":"above","durationSeconds":<until 7-1>,"durationText":"7月1日前","confidence":0.92,"error":null}
- "Will it rain tomorrow?" → {"asset":null,"threshold":null,"direction":null,"durationSeconds":86400,"durationText":"tomorrow","confidence":0.1,"error":"Not a crypto price question"}`

export async function parsePredictionIntent(message: string): Promise<ParsedPredictionIntent> {
  const now = new Date()
  const durationHint = parseCalendarDuration(message, now)

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: PREDICTION_INTENT_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            `Reference current time: ${formatReferenceNow(now)}`,
            `Reference current time (ISO): ${now.toISOString()}`,
            `User message: ${message}`,
            durationHint?.duration
              ? `Deterministic duration hint: ${durationHint.duration} seconds (${durationHint.durationText}).`
              : null,
          ].filter(Boolean).join("\n"),
        },
      ],
      temperature: 0.1,
      max_tokens: 300,
    })

    console.log("OpenAI prediction-intent response:", response.choices[0]?.message?.content)

    const content = response.choices[0]?.message?.content?.trim()
    if (!content) {
      return {
        asset: null, threshold: null, direction: null,
        durationSeconds: null, durationText: null,
        confidence: 0, error: "No response from AI",
      }
    }

    const parsed = JSON.parse(content) as ParsedPredictionIntent

    // Deterministic duration hint overrides AI guess when present.
    if (durationHint?.duration) {
      parsed.durationSeconds = durationHint.duration
      parsed.durationText = durationHint.durationText
    }

    // Light validation — anything missing should drag confidence below 0.5 so
    // the API caller rejects it.
    if (!parsed.asset || !parsed.threshold || !parsed.direction) {
      parsed.confidence = Math.min(parsed.confidence ?? 0, 0.4)
      parsed.error = parsed.error || "Missing asset, threshold, or direction"
    } else if (parsed.threshold <= 0) {
      parsed.confidence = Math.min(parsed.confidence ?? 0, 0.4)
      parsed.error = "Threshold must be positive"
    }

    return parsed
  } catch (err) {
    console.log(err)
    const errorMsg = err instanceof Error ? err.message : String(err)
    return {
      asset: null, threshold: null, direction: null,
      durationSeconds: durationHint?.duration ?? null,
      durationText: durationHint?.durationText ?? null,
      confidence: 0,
      error: `Parse error: ${errorMsg}`,
    }
  }
}

export async function parseIntent(message: string): Promise<ParsedIntent> {
  const intentType = await classifyIntent(message)

  if (intentType === "event_bet") {
    const eventBet = await parseEventIntent(message)
    return { type: "event_bet", eventBet }
  }

  if (intentType === "price_bet") {
    const priceBet = await parseBetIntent(message)
    return { type: "price_bet", priceBet }
  }

  // Unknown: try price bet as fallback (backward compat)
  const priceBet = await parseBetIntent(message)
  if (priceBet.confidence >= 0.5 && priceBet.asset && priceBet.duration) {
    return { type: "price_bet", priceBet }
  }

  return { type: "unknown" }
}
