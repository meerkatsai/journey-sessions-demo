export const fmt = (n) => new Intl.NumberFormat('en-IN').format(Math.round(n || 0))
export const inr = (n) => '₹' + fmt(n)
export const pct = (x, d = 1) => (x * 100).toFixed(d) + '%'
export const signed = (x, d = 0) => (x >= 0 ? '+' : '') + (x * 100).toFixed(d) + '%'

// red→green scale for a rate given a max in the set
export const cvrColor = (cvr, max) => {
  const t = Math.max(0, Math.min(1, cvr / (max || 0.12)))
  return `hsl(${8 + t * 140} 62% 46%)`
}

export const shortDate = (iso) =>
  new Date(iso).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })

export const timeOf = (iso) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
