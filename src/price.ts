let last: number | null = null
let lastFetch = 0
let inflight: Promise<number | null> | null = null

export const getCsprPrice = () => last

export async function fetchCsprPrice(): Promise<number | null> {
  if (last !== null && Date.now() - lastFetch < 25_000) return last
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const r = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=casper-network&vs_currencies=usd',
      )
      const j = await r.json()
      const price = j?.['casper-network']?.usd
      if (typeof price === 'number') {
        last = price
        lastFetch = Date.now()
      }
      return last
    } catch {
      return last
    } finally {
      inflight = null
    }
  })()
  return inflight
}
