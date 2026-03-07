"use server";

import { revalidatePath } from "next/cache";

import { createPromptFile, type PromptMode } from "@/lib/dashboard-data";

export interface PromptActionState {
  status: "idle" | "success" | "error";
  message: string;
}

export async function createPromptAction(
  _previousState: PromptActionState,
  formData: FormData,
): Promise<PromptActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const mode = String(formData.get("mode") ?? "text").trim() as PromptMode;
  const description = String(formData.get("description") ?? "").trim();
  const systemPrompt = String(formData.get("systemPrompt") ?? "").trim();
  const userPromptTemplate = String(formData.get("userPromptTemplate") ?? "").trim();

  if (!name || !systemPrompt || !userPromptTemplate) {
    return { status: "error", message: "Name, system prompt and user template are required." };
  }
  if (!["decision", "text"].includes(mode)) {
    return { status: "error", message: "Prompt mode must be 'decision' or 'text'." };
  }

  try {
    await createPromptFile({
      name,
      mode,
      description,
      systemPrompt,
      userPromptTemplate,
    });
    revalidatePath("/");
    return { status: "success", message: `Prompt '${name}' created and ready for the API.` };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create prompt";
    return { status: "error", message };
  }
}