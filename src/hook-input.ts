import fs from "node:fs"
import type { AppConfig } from "./config.js"
import type { HookInput } from "./types.js"
import { firstString } from "./utils.js"

export function parseHookInput(
  config: AppConfig,
  stdin = readStdin(),
  env: NodeJS.ProcessEnv = process.env,
): HookInput {
  const parsed = parseInput(stdin)
  const cwd = firstString(
    parsed.cwd,
    parsed.working_directory,
    env.CODEX_CWD,
    env.PWD,
    process.cwd(),
  )
  return {
    prompt: firstString(parsed.prompt, parsed.user_prompt, parsed.message),
    cwd,
    sessionId: firstString(parsed.session_id, parsed.sessionId, env.CODEX_SESSION_ID),
    promptModel: firstString(
      parsed.model,
      parsed.prompt_model,
      parsed.promptModel,
      env.CODEX_MODEL,
      env.OPENAI_MODEL,
    ),
    transcriptPath: firstString(
      parsed.transcript_path,
      parsed.transcriptPath,
      env.CODEX_TRANSCRIPT_PATH,
      env.CODEX_SESSION_PATH,
      latestSessionPath(config),
    ),
    notionTags: config.notionTags,
  }
}

function parseInput(stdin: string): Record<string, unknown> {
  if (!stdin.trim()) return {}
  try {
    return JSON.parse(stdin) as Record<string, unknown>
  } catch {
    return { prompt: stdin.trim() }
  }
}

export function readStdin(): string {
  try {
    return fs.readFileSync(0, "utf8")
  } catch {
    return ""
  }
}

export function latestSessionPath(config: AppConfig): string {
  const paths = sessionPathsForAll(config)
  return paths.at(-1) || ""
}

export function sessionPathsForDate(config: AppConfig, date: string): ReadonlyArray<string> {
  const [year, month, day] = date.split("-")
  if (!year || !month || !day) return []
  const dir = `${config.sessionsDir}/${year}/${month}/${day}`
  return listJsonlFiles(dir)
}

export function sessionPathsForAll(config: AppConfig): ReadonlyArray<string> {
  if (!fs.existsSync(config.sessionsDir)) return []
  const paths: string[] = []
  walk(config.sessionsDir, paths)
  return paths.sort()
}

function walk(dir: string, paths: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = `${dir}/${entry.name}`
    if (entry.isDirectory()) walk(fullPath, paths)
    else if (entry.isFile() && entry.name.endsWith(".jsonl")) paths.push(fullPath)
  }
}

function listJsonlFiles(dir: string): ReadonlyArray<string> {
  try {
    return fs
      .readdirSync(dir)
      .filter((name) => name.endsWith(".jsonl"))
      .map((name) => `${dir}/${name}`)
      .sort()
  } catch {
    return []
  }
}
