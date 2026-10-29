import { flameTier } from '../../shared/calc'

/** Streak flame: grows with the streak; gray until today is logged (spec §5 flame tiers). */
export function Flame({ count, lit, flare }: { count: number; lit: boolean; flare?: boolean }) {
  const tier = flameTier(count)
  return (
    <span
      className={`flame flame--${tier}${lit ? '' : ' flame--gray'}${flare ? ' flame--flare' : ''}`}
      aria-label={`Streak: ${count} day${count === 1 ? '' : 's'}${lit ? '' : ', not logged yet today'}`}
      role="img"
    >
      <svg viewBox="0 0 24 24" className="flame-icon" aria-hidden>
        <defs>
          <linearGradient id="flameGrad" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="var(--flame-from)" />
            <stop offset="100%" stopColor="var(--flame-to)" />
          </linearGradient>
        </defs>
        <path
          fill={lit ? 'url(#flameGrad)' : 'var(--text-2)'}
          d="M12 2c.6 3.1-1 4.9-2.6 6.6C7.8 10.3 6 12.2 6 15a6 6 0 0 0 12 0c0-2.4-1.2-4.1-2.3-5.4-.2 1.4-.9 2.5-2 3 .4-3.6-.6-7.6-1.7-10.6Z"
        />
      </svg>
      <span className="flame-count" key={count}>
        {count}
      </span>
    </span>
  )
}
