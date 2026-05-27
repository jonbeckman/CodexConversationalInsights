import fs from "node:fs"
import path from "node:path"
import { detectSkills } from "./skills.js"
import type { PromptSegment, TranscriptSummary } from "./types.js"
import { compactPrompt, hashPrompt, projectName } from "./utils.js"

interface MutableSegment {
  prompt: string
  promptHash: string
  promptExcerpt: string
  promptModel: string
  eventTexts: string[]
}

export function parseTranscript(transcriptPath: string): TranscriptSummary {
  const segments: MutableSegment[] = []
  let sessionId = ""
  let cwd = ""
  let promptModel = ""
  let currentModel = ""
  let current: MutableSegment | null = null

  for (const line of readLines(transcriptPath)) {
    const event = parseLine(line)
    if (!event) continue
    if (event.type === "session_meta") {
      sessionId ||= stringAt(event, "payload.id")
      cwd ||= stringAt(event, "payload.cwd")
      promptModel ||= stringAt(event, "payload.model")
    }
    if (event.type === "turn_context") {
      cwd ||= stringAt(event, "payload.cwd")
      currentModel =
        stringAt(event, "payload.model") ||
        stringAt(event, "payload.collaboration_mode.settings.model") ||
        currentModel
      promptModel ||= currentModel
    }
    const userPrompt = responseItemUserPrompt(event)
    if (userPrompt && isCandidateUserPrompt(userPrompt)) {
      current = {
        prompt: userPrompt,
        promptHash: hashPrompt(userPrompt),
        promptExcerpt: compactPrompt(userPrompt),
        promptModel: currentModel || promptModel,
        eventTexts: [],
      }
      segments.push(current)
      continue
    }
    if (current) current.eventTexts.push(extractEventText(event))
  }

  return {
    transcriptPath,
    sessionId: sessionId || sessionIdFromPath(transcriptPath),
    cwd,
    project: projectName(cwd),
    promptModel,
    promptSegments: segments.map(
      (segment): PromptSegment => ({
        prompt: segment.prompt,
        promptHash: segment.promptHash,
        promptExcerpt: segment.promptExcerpt,
        promptModel: segment.promptModel || promptModel,
        skills: detectSkills(segment.eventTexts.join("\n")),
      }),
    ),
  }
}

function readLines(filePath: string): ReadonlyArray<string> {
  try {
    return fs.readFileSync(filePath, "utf8").split(/\r?\n/u).filter(Boolean)
  } catch {
    return []
  }
}

function parseLine(line: string): Record<string, unknown> | null {
  try {
    return JSON.parse(line) as Record<string, unknown>
  } catch {
    return null
  }
}

function responseItemUserPrompt(event: Record<string, unknown>): string {
  if (event.type !== "response_item") return ""
  const payload = event.payload as Record<string, unknown> | undefined
  if (!payload || payload.type !== "message" || payload.role !== "user") return ""
  return extractContentText(payload.content)
}

function extractContentText(content: unknown): string {
  if (!Array.isArray(content)) return ""
  return content
    .map((item) => {
      if (!item || typeof item !== "object") return ""
      const record = item as Record<string, unknown>
      return typeof record.text === "string" ? record.text : ""
    })
    .join("\n")
    .trim()
}

function extractEventText(event: Record<string, unknown>): string {
  if (event.type === "event_msg") {
    const payload = event.payload as Record<string, unknown> | undefined
    return [payload?.message, payload?.reason, payload?.type]
      .filter((value) => typeof value === "string")
      .join("\n")
  }
  if (event.type === "response_item") {
    const payload = event.payload as Record<string, unknown> | undefined
    if (!payload) return ""
    if (payload.type === "message") return extractContentText(payload.content)
    if (payload.type === "function_call" || payload.type === "custom_tool_call") {
      return [payload.name, payload.arguments, payload.input]
        .filter((value) => typeof value === "string")
        .join("\n")
    }
    if (payload.type === "function_call_output" || payload.type === "custom_tool_call_output")
      return ""
    return ""
  }
  return JSON.stringify(event)
}

function isCandidateUserPrompt(prompt: string): boolean {
  const trimmed = prompt.trim()
  if (!trimmed) return false
  if (trimmed.startsWith("# AGENTS.md instructions for ")) return false
  if (trimmed.startsWith("You are a helpful assistant. You will be presented with a user prompt"))
    return false
  return true
}

function stringAt(value: Record<string, unknown>, dottedPath: string): string {
  let current: unknown = value
  for (const part of dottedPath.split(".")) {
    if (!current || typeof current !== "object") return ""
    current = (current as Record<string, unknown>)[part]
  }
  return typeof current === "string" ? current : ""
}

function sessionIdFromPath(filePath: string): string {
  const basename = path.basename(filePath, ".jsonl")
  const match = basename.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/iu)
  return match?.[1] || ""
}
