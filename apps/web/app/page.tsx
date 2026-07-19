const boundaries = [
  {
    label: "Presentation",
    value: "Static export",
    detail: "No server rendering, middleware, or framework route handlers.",
  },
  {
    label: "Runtime",
    value: "Hono at the edge",
    detail: "Only fixed API routes execute in the Cloudflare Worker.",
  },
  {
    label: "System of record",
    value: "Snowflake",
    detail: "Key-pair SQL API calls reach an owner-executed procedure allowlist.",
  },
] as const;

export default function PreflightPage() {
  return (
    <main>
      <section className="shell" aria-labelledby="page-title">
        <header className="masthead">
          <div className="brand" aria-label="Ripple">
            <span className="brand-mark" aria-hidden="true">
              R
            </span>
            <span>Ripple</span>
          </div>
          <span className="phase">Capability preflight</span>
        </header>

        <div className="intro">
          <p className="eyebrow">Runtime boundary 01</p>
          <h1 id="page-title">A deliberately small surface for proving the architecture.</h1>
          <p className="lede">
            This route is generated as static HTML. It exists only to verify the delivery boundary
            before product interfaces and the final visual system are built.
          </p>
        </div>

        <dl className="boundary-grid">
          {boundaries.map((boundary, index) => (
            <div className="boundary" key={boundary.label}>
              <dt>
                <span>{String(index + 1).padStart(2, "0")}</span>
                {boundary.label}
              </dt>
              <dd>{boundary.value}</dd>
              <p>{boundary.detail}</p>
            </div>
          ))}
        </dl>

        <footer>
          <span>Preflight artifact</span>
          <span>Product UI follows the visual-direction gate</span>
        </footer>
      </section>
    </main>
  );
}
