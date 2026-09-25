export default function PhasePanel({ eyebrow, title, description, children }) {
  return (
    <section className="panel-grid overflow-hidden rounded-lg border border-white/[0.085] bg-panel/75">
      <div className="border-b border-white/[0.07] px-5 py-5 sm:px-7">
        <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.18em] text-signal/70">{eyebrow}</div>
        <h1 className="font-display text-2xl font-semibold tracking-wide text-slate-100 sm:text-3xl">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">{description}</p>
      </div>
      <div className="p-5 sm:p-7">{children}</div>
    </section>
  );
}
