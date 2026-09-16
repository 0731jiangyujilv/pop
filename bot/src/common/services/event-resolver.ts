import OpenAI from "openai"
import { config } from "../config"
import type { DataItem } from "../capabilities/types"

const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY })

export interface EventResolution {
  outcome: "YES" | "NO"
  confidence: number
  reasoning: string
}

const RESOLVER_SYSTEM_PROMPT = `You are an event resolution judge for a prediction market. You must determine whether a specific event has occurred based on evidence from the provided data.

Rules:
1. Analyze ALL provided data items for evidence that the event occurred.
2. An event counts as "occurred" ONLY if there is clear, direct evidence. Indirect hints, rumors, or speculation are NOT sufficient.
3. If no data is provided, or data contains no relevant evidence, the outcome is "NO".
4. Be strict: the default is "NO" unless there is strong evidence for "YES".
5. Provide a brief reasoning explaining your decision.

Return ONLY valid JSON: {"outcome": "YES" or "NO", "confidence": 0.0-1.0, "reasoning": "brief explanation"}
No markdown, no extra text.`

export async function resolveEvent(
  question: string,
  items: DataItem[],
  source: string,
): Promise<EventResolution> {
  const dataText = items.length > 0
    ? items.map((item, i) => `[${i + 1}] (${item.timestamp}) ${item.text}`).join("\n")
    : "(No data found in the specified time range)"

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: RESOLVER_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            `Question: ${question}`,
            `Data source: ${source}`,
            ``,
            `Data to analyze:`,
            dataText,
          ].join("\n"),
        },
      ],
      temperature: 0,
      max_tokens: 300,
    })

    const content = response.choices[0]?.message?.content?.trim()
    if (!content) {
      return { outcome: "NO", confidence: 0.5, reasoning: "AI returned no response, defaulting to NO" }
    }

    const parsed = JSON.parse(content) as EventResolution

    if (parsed.outcome !== "YES" && parsed.outcome !== "NO") {
      return { outcome: "NO", confidence: 0.3, reasoning: `Invalid AI outcome "${parsed.outcome}", defaulting to NO` }
    }

    if (parsed.outcome === "YES" && parsed.confidence < 0.5) {
      return {
        outcome: "NO",
        confidence: parsed.confidence,
        reasoning: `Low confidence (${parsed.confidence}) for YES, defaulting to NO. Original: ${parsed.reasoning}`,
      }
    }

    return parsed
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error("[event-resolver] AI resolution failed:", errorMsg)
    return {
      outcome: "NO",
      confidence: 0.1,
      reasoning: `AI resolution error: ${errorMsg}. Defaulting to NO.`,
    }
  }
}
