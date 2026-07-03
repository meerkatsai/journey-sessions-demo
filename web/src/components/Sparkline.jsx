export default function Sparkline({ points, color = 'var(--accent)', h = 30 }) {
  if (!points || points.length < 2) return <div className="spark" style={{ height: h }} />
  const w = 200
  const max = Math.max(...points), min = Math.min(...points)
  const rng = max - min || 1
  const step = w / (points.length - 1)
  const d = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(h - 3 - ((p - min) / rng) * (h - 6)).toFixed(1)}`)
    .join(' ')
  const area = `${d} L${w},${h} L0,${h} Z`
  const gid = 'g' + Math.abs(points.reduce((a, b) => a + b * 1000, points.length)).toString(36)
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ height: h }}>
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.25" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
