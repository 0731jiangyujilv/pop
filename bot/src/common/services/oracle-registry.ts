import { prisma } from "../db"

function normalizeAssetPair(asset: string): string {
  return asset.replace(/\$/g, "").trim().toUpperCase()
}

export async function isAssetSupported(asset: string, chainId?: number): Promise<boolean> {
  const normalizedAsset = normalizeAssetPair(asset)
  const oracle = await prisma.oracleRegistry.findFirst({
    where: {
      asset: { contains: normalizedAsset },
      isActive: true,
      ...(chainId != null ? { chainId } : {}),
    },
    select: { isActive: true },
  })

  return Boolean(oracle)
}

export async function listSupportedAssets(chainId?: number): Promise<string[]> {
  const rows = await prisma.oracleRegistry.findMany({
    where: {
      isActive: true,
      ...(chainId != null ? { chainId } : {}),
    },
    orderBy: { asset: "asc" },
    select: { asset: true },
    distinct: ["asset"],
  })

  return rows.map((row) => row.asset)
}
