import { Client } from "@xdevplatform/xdk"
import { config } from "../config"
import type { Capability, ValidationResult, FetchedData } from "./types"

const readClientConfig= {
  bearerToken: config.X_API_BEARER_TOKEN,
  baseUrl: config.X_API_BASE_URL,
}

const readClient = new Client(readClientConfig) as any

async function getUserIdByUsername(username: string): Promise<string | null> {
  try {
    const response: any = await readClient.users.getByUsername(username, {
      userFields: ["id", "public_metrics"],
    })
    console.log(`[x-post] getByUsername @${username} response:`, JSON.stringify(response.data || response).slice(0, 200))
    return response.data?.id ? String(response.data.id) : null
  } catch (err: any) {
    console.error(`[x-post] getByUsername @${username} failed:`, err?.message || err)
    return null
  }
}

async function fetchTweets(username: string, since?: Date, until?: Date, maxResults = 100) {
  // Use search/recent with "from:username" — works with bearer token (app-only auth)
  // getTimeline requires OAuth2 user token which we don't have
  const params: any = {
    tweetFields: ["created_at", "text"],
    maxResults: Math.min(maxResults, 100),
  }
  if (since) params.startTime = since.toISOString()
  if (until) {
    // Twitter API requires endTime to be at least 30s before now
    const maxEnd = new Date(Date.now() - 30_000)
    const safeUntil = until > maxEnd ? maxEnd : until
    params.endTime = safeUntil.toISOString()
  }
  
  console.debug(params)

  const response: any = await readClient.posts.searchRecent(`from:${username}`, params)
  const tweets = response.data || []
  return tweets
    .map((t: any) => ({
      id: String(t.id || ""),
      text: String(t.text || ""),
      timestamp: String(t.created_at || t.createdAt || ""),
    }))
    .filter((t: any) => t.id && t.text)
}

export const xPostCapability: Capability = {
  type: "X_POST",

  async validate(capConfig: { username: string }): Promise<ValidationResult> {
    const { username } = capConfig
    console.debug(`username to validate ${username}`)
    if (!username) {
      return { valid: false, error: "Missing username" }
    }

    const cleaned = username.replace(/^@/, "")
    console.debug(`cleaned username to validate ${cleaned}`)

    const userId = await getUserIdByUsername(cleaned)
    if (!userId) {
      return { valid: false, error: `X user @${cleaned} not found` }
    }

    // Try to fetch a few recent tweets to confirm account is public and active
    let recentCount = 0
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      const recent = await fetchTweets(cleaned, sevenDaysAgo, new Date(), 10)
      recentCount = recent.length
    } catch (err: any) {
      console.error(`[x-post] fetchTweets for @${cleaned} (${userId}) failed:`, err?.message || err)
      return {
        valid: false,
        error: `Cannot read posts from @${cleaned} (account may be private or restricted)`,
      }
    }

    console.log(`[x-post] Validated @${cleaned}: userId=${userId}, recentPosts=${recentCount}`)

    return {
      valid: true,
      meta: {
        userId,
        username: cleaned,
        recentPostCount: recentCount,
      },
    }
  },

  async fetchData(
    capConfig: { username: string },
    since: Date,
    until: Date,
  ): Promise<FetchedData> {
    const cleaned = capConfig.username.replace(/^@/, "")
    const userId = await getUserIdByUsername(cleaned)
    if (!userId) {
      return { items: [], source: `X posts from @${cleaned} (user not found)` }
    }

    try {
      const items = await fetchTweets(cleaned, since, until, 100)
      return {
        items,
        source: `X posts from @${cleaned}`,
      }
    } catch (err) {
      console.error(`[x-post] Failed to fetch posts for @${cleaned}:`, err)
      return { items: [], source: `X posts from @${cleaned} (fetch failed)` }
    }
  },
}
