import type { SettingsGroup } from "@/lib/dashboard-data";

export function SettingsPanels({ groups }: { groups: SettingsGroup[] }) {
  return (
    <div className="settings-grid">
      {groups.map((group) => (
        <article className="settings-card" key={group.title}>
          <div className="mini-label">{group.title}</div>
          <h3>{group.description}</h3>
          <dl className="settings-stack">
            {group.items.map((item) => (
              <div className="stack-row" key={item.key}>
                <dt>{item.key}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        </article>
      ))}
    </div>
  );
}