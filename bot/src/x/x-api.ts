import { Client, OAuth1, type ClientConfig, type OAuth1Config } from "@xdevplatform/xdk"
import { config } from "../common/config"

export interface MentionAuthor {
  id: string
  username?: string
}

export interface MentionTweet {
  id: string
  text: string
  conversationId?: string
  author: MentionAuthor
}

const readClientConfig: ClientConfig = {
  bearerToken: config.X_API_BEARER_TOKEN,
  baseUrl: config.X_API_BASE_URL,
}

const oauth1Config: OAuth1Config = {
  apiKey: config.X_API_CONSUMER_KEY,
  apiSecret: config.X_API_CONSUMER_SECRET,
  callback: "",
  accessToken: config.X_API_ACCESS_TOKEN,
  accessTokenSecret: config.X_API_ACCESS_TOKEN_SECRET,
}

const writeClientConfig: ClientConfig = {
  oauth1: new OAuth1(oauth1Config),
  baseUrl: config.X_API_BASE_URL,
}

const readClient = new Client(readClientConfig)
const writeClient = new Client(writeClientConfig)

export async function fetchMentions(sinceId?: string): Promise<MentionTweet[]> {
  const response: any = await readClient.users.getMentions(config.X_API_BOT_USER_ID, {
    expansions: ["author_id"],
    tweetFields: ["conversation_id", "created_at"],
    userFields: ["username"],
    ...(sinceId ? { sinceId } : {}),
  } as any)

  const tweets = response.data || []
  const users = new Map<string, any>(
    (response.includes?.users || []).map((user: any) => [String(user.id), user])
  )

  return tweets
    .map((item: any) => {
      const authorId = String(item.authorId || item.author_id || "")
      const author = users.get(authorId)

      return {
        id: String(item.id || ""),
        text: String(item.text || ""),
        conversationId: item.conversationId
          ? String(item.conversationId)
          : item.conversation_id
            ? String(item.conversation_id)
            : undefined,
        author: {
          id: authorId,
          username: author?.username,
        },
      }
    })
    .filter((tweet: MentionTweet) => tweet.id && tweet.author.id && tweet.text)
}

export async function createTweet(input: {
  text: string
  replyToTweetId?: string
}): Promise<{ id: string }> {
  const response = await writeClient.posts.create({
    text: input.text,
    ...(input.replyToTweetId ? { reply: { inReplyToTweetId: input.replyToTweetId } } : {}),
  } as any)

  const id = response.data?.id || (response as any)?.id
  if (!id) {
    throw new Error("X create tweet missing tweet id")
  }

  return { id: String(id) }
}

export function tweetUrl(username: string, tweetId: string) {
  return `https://x.com/${username.replace(/^@/, "")}/status/${tweetId}`
}
