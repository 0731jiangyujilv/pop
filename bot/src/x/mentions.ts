import { prisma } from "../common/db"
import { config, publicWebappUrl } from "../common/config"
import { parseBetIntent, parseIntent, type ParsedEventIntent } from "../common/services/openai"
import { isAssetSupported } from "../common/services/oracle-registry"
import { getCapability } from "../common/capabilities/registry"
import { createTweet, fetchMentions } from "./x-api"
import type { MentionTweet } from "./x-api"

function formatDuration(seconds: number) {
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`
  return `${Math.round(seconds / 86400)}d`
}

function stripBotMention(text: string) {
  const username = config.BOT_X_USERNAME.replace(/^@/, "")
  return text.replace(new RegExp(`@${username}`, "ig"), "").trim()
}

function proposalTweetText(input: {
  username?: string
  asset: string
  duration: number
  uuid: string
}) {
  const createUrl = `${publicWebappUrl}/create/${input.uuid}?source=x`
  const creator = input.username ? `@${input.username}` : "you"

  return [
    `Your ${input.asset}C ${formatDuration(input.duration)} price-direction market is ready.`,
    `Launch it on-chain here: ${createUrl}`,
    // `Fee: 1% total. The market creator receives 30% of that fee.`,
    // `After deployment, share the prediction link on X. The bot will monitor the contract and post follow-ups.`
  ].join("\n")
}

function invalidIntentTweet(error: string) {
  return [
    "I could not create a valid market from that request.",
    error,
    "Example: @bot BTC 5m, @bot LINK in tomorrow, or @bot virtual in 3.21"
  ].join("\n")
}

const CRUDE_OIL_PATTERNS = [
  /原油/,
  /\bcrude\b/i,
  /\bcrude\s*oil\b/i,
  /\bWTI\b/i,
  /\bBrent\b/i,
  /\boil\s*price/i,
  /\boil.*涨/,
  /\boil.*跌/,
]

function isCrudeOilDiscussion(text: string): boolean {
  return CRUDE_OIL_PATTERNS.some((p) => p.test(text))
}

function crudeOilTweetText() {
  return "Your OIL/USDC 6h price-direction market is ready. \nLaunch it on ARC here: https://arc.populab.xyz/create"
}

function eventProposalTweetText(input: {
  username?: string
  question: string
  dataSourceUsername: string
  uuid: string
}) {
  const createUrl = `${publicWebappUrl}/event/create/${input.uuid}?source=x`
  return [
    `Event market ready: "${input.question}"`,
    `Data source: X posts from @${input.dataSourceUsername}`,
    `Launch it on-chain: ${createUrl}`,
  ].join("\n")
}

function eventProposalTweetTextSwarm(input: {
  question: string
  uuid: string
}) {
  const createUrl = `${publicWebappUrl}/event/create/${input.uuid}?source=x`
  return [
    `Event market ready: "${input.question}"`,
    `Launch it on-chain: ${createUrl}`,
  ].join("\n")
}

async function handleEventBetMention(
  mention: MentionTweet,
  eventIntent: ParsedEventIntent,
  xUser: { walletAddress: string | null },
) {
  if (!eventIntent.question || !eventIntent.duration) {
    console.debug(`Event intent missing question/duration for mention ${mention.id}, skipping`)
    return
  }

  // Resolution strategy:
  //   explicit dataSourceConfig → validate & use the matching capability
  //   no dataSourceConfig       → fall back to the 5-oracle AI swarm
  //                               (queries Twitter + Google + News + Reddit + YouTube
  //                                and reaches confidence-weighted consensus)
  // const useSwarm = !eventIntent.dataSourceConfig
  const useSwarm = true
  const capType = useSwarm ? "SWARM" : eventIntent.dataSourceType || "X_POST"

  if (!useSwarm) {
    const capability = getCapability(capType)
    if (!capability) {
      console.debug(`No capability found for type "${capType}", skipping mention ${mention.id}`)
      await createTweet({
        text: `Data source type "${capType}" is not supported yet.`,
        replyToTweetId: mention.id,
      })
      return
    }

    const validation = await capability.validate(eventIntent.dataSourceConfig)
    if (!validation.valid) {
      console.debug(`Data source validation failed for mention ${mention.id}: ${validation.error}`)
      await createTweet({
        text: `Cannot create event market: ${validation.error}`,
        replyToTweetId: mention.id,
      })
      return
    }

    console.debug(`Data source validated for mention ${mention.id}:`, validation.meta)
  } else {
    console.debug(`No explicit data source for mention ${mention.id} — falling back to 5-oracle SWARM`)
  }

  const proposal = await prisma.xProposal.create({
    data: {
      tweetId: mention.id,
      conversationId: mention.conversationId || mention.id,
      creatorXUserId: mention.author.id,
      creatorUsername: mention.author.username || null,
      creatorWallet: xUser.walletAddress,
      asset: "EVENT",
      duration: eventIntent.duration,
      minAmount: config.DEFAULT_MIN_AMOUNT,
      maxAmount: config.DEFAULT_MAX_AMOUNT,
      type: "EVENT_BET",
      question: eventIntent.question,
      dataSourceType: capType,
      dataSourceConfig: eventIntent.dataSourceConfig
        ? JSON.stringify(eventIntent.dataSourceConfig)
        : null,
    },
  })

  const reply = await createTweet({
    text: useSwarm
      ? eventProposalTweetTextSwarm({
          question: eventIntent.question,
          uuid: proposal.uuid,
        })
      : eventProposalTweetText({
          username: mention.author.username,
          question: eventIntent.question,
          dataSourceUsername: eventIntent.dataSourceConfig!.username,
          uuid: proposal.uuid,
        }),
    replyToTweetId: mention.id,
  })

  await prisma.xProposal.update({
    where: { id: proposal.id },
    data: { proposalReplyTweetId: reply.id },
  })
}

export async function pollMentions() {
  const cursor = await prisma.cursor.findUnique({ where: { key: "last_mention_id" } })
  const mentions = await fetchMentions(cursor?.value)
  if (mentions.length === 0) return

  const sortedMentions = mentions.sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1))

  for (const mention of sortedMentions) {
    const existing = await prisma.xProposal.findUnique({ where: { tweetId: mention.id } })
    if (existing) {
      await upsertMentionCursor(mention.id)
      continue
    }

    const cleaned = stripBotMention(mention.text)
    console.debug(`Processing mention ${mention.id} from @${mention.author.username}: "${cleaned}"`)

    if (isCrudeOilDiscussion(mention.text)) {
      console.debug(`Crude oil discussion detected for mention ${mention.id}, replying with custom link`)
      await createTweet({
        text: crudeOilTweetText(),
        replyToTweetId: mention.id,
      })
      await upsertMentionCursor(mention.id)
      continue
    }

    const xUser = await prisma.xUser.upsert({
      where: { xUserId: mention.author.id },
      update: { username: mention.author.username || null },
      create: {
        xUserId: mention.author.id,
        username: mention.author.username || null,
      },
    })

    // Use intent classification to route to price bet or event bet
    const intent = await parseIntent(cleaned)
    console.debug(`Classified intent for mention ${mention.id}: type=${intent.type}`)

    if (intent.type === "event_bet" && intent.eventBet) {
      console.debug(`Event bet intent for mention ${mention.id}:`, intent.eventBet)
      await handleEventBetMention(mention, intent.eventBet, xUser)
      await upsertMentionCursor(mention.id)
      continue
    }

    // Price bet flow (existing logic)
    const priceBetIntent = intent.priceBet
    if (!priceBetIntent || priceBetIntent.confidence < 0.5 || !priceBetIntent.asset || !priceBetIntent.duration) {
      // If the user's intention is unclear, we can choose to ignore it instead of replying with an error.
      continue;
      await createTweet({
        text: invalidIntentTweet(priceBetIntent?.error || "Please include both an asset and a duration."),
        replyToTweetId: mention.id,
      })
      await upsertMentionCursor(mention.id)
      continue
    }

    if (!(await isAssetSupported(priceBetIntent.asset))) {
      await createTweet({
        text: `${priceBetIntent.asset}C is not supported yet. Coming soon.`,
        replyToTweetId: mention.id,
      })
      await upsertMentionCursor(mention.id)
      continue
    }

    const proposal = await prisma.xProposal.create({
      data: {
        tweetId: mention.id,
        conversationId: mention.conversationId || mention.id,
        creatorXUserId: mention.author.id,
        creatorUsername: mention.author.username || null,
        creatorWallet: xUser.walletAddress,
        asset: priceBetIntent.asset,
        duration: priceBetIntent.duration,
        minAmount: config.DEFAULT_MIN_AMOUNT,
        maxAmount: config.DEFAULT_MAX_AMOUNT,
      },
    })

    const reply = await createTweet({
      text: proposalTweetText({
        username: mention.author.username,
        asset: proposal.asset,
        duration: proposal.duration,
        uuid: proposal.uuid,
      }),
      replyToTweetId: mention.id,
    })

    await prisma.xProposal.update({
      where: { id: proposal.id },
      data: { proposalReplyTweetId: reply.id },
    })

    await upsertMentionCursor(mention.id)
  }
}

async function upsertMentionCursor(value: string) {
  await prisma.cursor.upsert({
    where: { key: "last_mention_id" },
    update: { value },
    create: { key: "last_mention_id", value },
  })
}
