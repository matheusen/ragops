"use client";

import { useActionState } from "react";

import { createPromptAction, type PromptActionState } from "@/app/actions";

const initialState: PromptActionState = {
  status: "idle",
  message: "",
};

export function PromptCreateForm() {
  const [state, formAction, isPending] = useActionState(createPromptAction, initialState);

  return (
    <form action={formAction}>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="name">Prompt name</label>
          <input className="input" id="name" name="name" placeholder="incident_triage_v2" required />
        </div>

        <div className="field">
          <label htmlFor="mode">Mode</label>
          <select className="select" id="mode" name="mode" defaultValue="decision">
            <option value="decision">decision</option>
            <option value="text">text</option>
          </select>
        </div>

        <div className="field-large">
          <label htmlFor="description">Description</label>
          <input className="input" id="description" name="description" placeholder="What this prompt is for and when to use it." />
        </div>

        <div className="field-large">
          <label htmlFor="systemPrompt">System prompt</label>
          <textarea className="textarea" id="systemPrompt" name="systemPrompt" placeholder="You are an operations triage analyst..." required />
        </div>

        <div className="field-large">
          <label htmlFor="userPromptTemplate">User prompt template</label>
          <textarea
            className="textarea"
            id="userPromptTemplate"
            name="userPromptTemplate"
            placeholder={"Analyze the content below.\n\nTitle: {title}\n\nContent:\n{content}"}
            required
          />
        </div>
      </div>

      <div className="button-row">
        <button className="button" type="submit" disabled={isPending}>
          {isPending ? "Creating prompt..." : "Create prompt"}
        </button>
        <div className={`status-note ${state.status === "error" ? "error" : state.status === "success" ? "success" : ""}`}>
          {state.message}
        </div>
      </div>
    </form>
  );
}