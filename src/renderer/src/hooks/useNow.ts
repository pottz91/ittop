import { useEffect, useState } from 'react'

/** Ticks a re-render every `intervalMs` so relative-time labels ("2m ago") stay fresh. */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
