import type { PromptTemplate } from "@/lib/dashboard-data";

export function PromptLibrary({ prompts }: { prompts: PromptTemplate[] }) {
  return (
    <div className="prompt-list">
      {prompts.map((prompt) => (
        <article className="prompt-item" key={prompt.fileName}>
          <div className="prompt-head">
            <div>
              <div className="prompt-name">{prompt.name}</div>
              <div className="prompt-body">{prompt.description || "No description provided."}</div>
            </div>
            <div className="chip-row">
              <span className="chip accent">{prompt.mode}</span>
              <span className="chip">{prompt.fileName}</span>
            </div>
          </div>
          <div className="prompt-body">
            <strong>System:</strong> {prompt.systemPrompt.slice(0, 220)}{prompt.systemPrompt.length > 220 ? "..." : ""}
          </div>
          <div className="prompt-body mono">Template vars preview: {extractTemplatePreview(prompt.userPromptTemplate)}</div>
        </article>
      ))}
    </div>
  );
}

function extractTemplatePreview(template: string) {
  const matches = template.match(/\{[a-zA-Z0-9_]+\}/g);
  if (!matches?.length) {
    return "no placeholders";
  }
  return matches.join(" · ");
}