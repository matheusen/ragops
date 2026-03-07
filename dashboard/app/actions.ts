"use server";

import { revalidatePath } from "next/cache";

import { createPromptFile, deletePromptFile, updatePromptFile, type PromptMode } from "@/lib/dashboard-data";
import { deleteSetting, saveSetting } from "@/lib/settings-store";
import { saveFlow, deleteFlow, type SavedFlowDoc } from "@/lib/flow-store";

export interface PromptActionState {
  status: "idle" | "success" | "error";
  message: string;
}

export interface SettingActionState {
  status: "idle" | "success" | "error";
  message: string;
  key?: string;
}

export async function saveSettingAction(
  _previousState: SettingActionState,
  formData: FormData,
): Promise<SettingActionState> {
  const key = String(formData.get("key") ?? "").trim();
  const value = String(formData.get("value") ?? "").trim();
  const reset = formData.get("reset") === "true";

  if (!key) {
    return { status: "error", message: "Chave inválida.", key };
  }

  try {
    if (reset) {
      await deleteSetting(key);
    } else {
      await saveSetting(key, value);
    }
    revalidatePath("/settings");
    return {
      status: "success",
      message: reset ? `${key} resetado para o valor do .env.` : `${key} salvo.`,
      key,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao salvar.";
    return { status: "error", message, key };
  }
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

export async function updatePromptAction(
  _previousState: PromptActionState,
  formData: FormData,
): Promise<PromptActionState> {
  const fileName = String(formData.get("fileName") ?? "").trim();
  const mode = String(formData.get("mode") ?? "text").trim() as PromptMode;
  const description = String(formData.get("description") ?? "").trim();
  const systemPrompt = String(formData.get("systemPrompt") ?? "").trim();
  const userPromptTemplate = String(formData.get("userPromptTemplate") ?? "").trim();

  if (!fileName || !systemPrompt || !userPromptTemplate) {
    return { status: "error", message: "System prompt and user template are required." };
  }

  try {
    await updatePromptFile(fileName, { mode, description, systemPrompt, userPromptTemplate });
    revalidatePath("/prompts");
    return { status: "success", message: `Prompt '${fileName}' saved.` };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save prompt";
    return { status: "error", message };
  }
}

export async function deletePromptAction(
  _previousState: PromptActionState,
  formData: FormData,
): Promise<PromptActionState> {
  const fileName = String(formData.get("fileName") ?? "").trim();
  if (!fileName) return { status: "error", message: "fileName missing." };

  try {
    await deletePromptFile(fileName);
    revalidatePath("/prompts");
    return { status: "success", message: `Prompt '${fileName}' deleted.` };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete prompt";
    return { status: "error", message };
  }
}

export interface ProviderConfigState {
  status: "idle" | "success" | "error";
  message: string;
}

/** Saves DEFAULT_PROVIDER + the matching model key (OPENAI_MODEL / GEMINI_MODEL / OLLAMA_MODEL) at once. */
export async function saveProviderConfigAction(
  _previousState: ProviderConfigState,
  formData: FormData,
): Promise<ProviderConfigState> {
  const provider = String(formData.get("provider") ?? "").trim().toLowerCase();
  // Both the preset <select> and custom <input> share the name "model".
  // Pick the last non-empty value so the custom input overrides the dropdown.
  const modelValues = formData.getAll("model").map((v) => String(v).trim()).filter(Boolean);
  const model = modelValues[modelValues.length - 1] ?? "";

  if (!provider) return { status: "error", message: "Provider is required." };
  if (!model && provider !== "mock") return { status: "error", message: "Model is required." };

  const modelKeyMap: Record<string, string> = {
    openai: "OPENAI_MODEL",
    gemini: "GEMINI_MODEL",
    ollama: "OLLAMA_MODEL",
  };

  try {
    await saveSetting("DEFAULT_PROVIDER", provider);
    const modelKey = modelKeyMap[provider];
    if (modelKey && model) await saveSetting(modelKey, model);
    revalidatePath("/settings");
    return { status: "success", message: `Provider set to ${provider} / ${model || "(mock)"}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save provider config";
    return { status: "error", message };
  }
}

// ── Flow actions ───────────────────────────────────────────────────────────────
export async function saveFlowAction(
  name: string,
  nodes: SavedFlowDoc["nodes"],
  edges: SavedFlowDoc["edges"],
): Promise<{ ok: boolean; id: string }> {
  return saveFlow(name, nodes, edges);
}

export async function deleteFlowAction(id: string): Promise<{ ok: boolean }> {
  return deleteFlow(id);
}