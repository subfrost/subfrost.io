import { SWRConfig } from 'swr'
import HomeClient from '@/components/HomeClient'
import { getStats } from '@/lib/stats'

export const dynamic = 'force-dynamic'

// Server shell: read the full stat set from the durable store at request time and
// hand it to the client tree as the SWR fallback for '/api/stats', so the home is
// server-rendered WITH data on first paint (no '...' flash, no slow first load),
// even cold (the store is durable — survives deploys/restarts).
export default async function Page() {
  const initialStats = await getStats()
  return (
    <SWRConfig value={{ fallback: { '/api/stats': initialStats } }}>
      <HomeClient initialStats={initialStats} />
    </SWRConfig>
  )
}
