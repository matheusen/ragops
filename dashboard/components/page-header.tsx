export function PageHeader({
  eyebrow,
  title,
  description,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  subtitle?: string;
}) {
  const copy = description ?? subtitle ?? "";
  return (
    <header className="page-header">
      {eyebrow && <div className="mini-label">{eyebrow}</div>}
      <h1>{title}</h1>
      {copy && <p>{copy}</p>}
    </header>
  );
}
