import logoUrl from './casperflow-logo.png'

// CasperFlow logo — the real artwork (neon C + connected-nodes flow mark),
// black background removed so the glow sits on the dark UI.
export default function Logo({ size = 22 }: { size?: number }) {
  return (
    <img
      className="brand-logo-img"
      src={logoUrl}
      alt="CasperFlow"
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
      style={{
        height: size * 2.2,
        width: 'auto',
        display: 'block',
        flexShrink: 0,
        transform: 'scale(1.3)',
        transformOrigin: 'center',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        // Decorative — clicks go to the brand button; can't be dragged out.
        pointerEvents: 'none',
      }}
    />
  )
}
