interface Props {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  emphasis?: "default" | "amber" | "olive" | "purple";
}

export function StatTile({ label, value, sub, emphasis = "default" }: Props) {
  const accent =
    emphasis === "amber"  ? "text-cnx-amber" :
    emphasis === "olive"  ? "text-cnx-olive" :
    emphasis === "purple" ? "text-cnx-purple" :
    "text-ink";
  return (
    <div className="card flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-stone">
        {label}
      </span>
      <span className={`num font-display text-3xl font-medium leading-none ${accent}`}>
        {value}
      </span>
      {sub && <span className="text-xs text-graphite">{sub}</span>}
    </div>
  );
}
