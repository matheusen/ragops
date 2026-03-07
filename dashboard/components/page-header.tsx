export function PageHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <header className="page-header">
      <div className="mini-label">{eyebrow}</div>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  );
}