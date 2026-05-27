import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { readEnvFile } from "./env.js"
import { findCodexHome, findNearestPackageRoot, parseList, stripCollectionPrefix } from "./utils.js"

const moduleDir = process.argv[1] ? path.dirname(path.resolve(process.argv[1])) : process.cwd()

export interface AppConfig {
  readonly repoRoot: string
  readonly codexHome: string
  readonly pluginRoot: string
  readonly pluginData: string
  readonly stateDir: string
  readonly statePath: string
  readonly logPath: string
  readonly sessionsDir: string
  readonly notionToken: string
  readonly notionVersion: string
  readonly notionDataSourceId: string
  readonly notionDatabaseId: string
  readonly notionTags: ReadonlyArray<string>
  readonly classifierModel: string
  readonly fallbackModel: string
  readonly codexPath: string
  readonly backfillPromptModel: string
  readonly backfillBatchSize: number
  readonly classifierTimeoutMs: number
  readonly batchClassifierTimeoutMs: number
  readonly notionMaxRetries: number
  readonly notionMinRequestIntervalMs: number
  readonly envFiles: ReadonlyArray<string>
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const repoRoot =
    env.PLUGIN_ROOT ||
    findNearestPackageRoot(moduleDir) ||
    findNearestPackageRoot(process.cwd()) ||
    process.cwd()
  const codexHome = findCodexHome(env)
  const pluginRoot = env.PLUGIN_ROOT || ""
  const pluginData = env.PLUGIN_DATA || ""
  const envFiles = [
    path.join(repoRoot, ".env"),
    pluginData ? path.join(pluginData, ".env") : "",
    env.CODEX_CONVERSATIONAL_INSIGHTS_ENV_FILE || "",
  ].filter(Boolean)
  const envFileValues = Object.assign({}, ...envFiles.map((filePath) => readEnvFile(filePath)))
  const merged = { ...envFileValues, ...env } as Record<string, string | undefined>
  const stateDir =
    merged.CODEX_CONVERSATIONAL_INSIGHTS_STATE_DIR ||
    pluginData ||
    path.join(codexHome, "conversational-insights")

  return {
    repoRoot,
    codexHome,
    pluginRoot,
    pluginData,
    stateDir,
    statePath: path.join(stateDir, "state.json"),
    logPath: path.join(stateDir, "events.jsonl"),
    sessionsDir:
      merged.CODEX_CONVERSATIONAL_INSIGHTS_SESSIONS_DIR || path.join(codexHome, "sessions"),
    notionToken: merged.NOTION_TOKEN || merged.NOTION_API_TOKEN || "",
    notionVersion: merged.NOTION_VERSION || "2026-03-11",
    notionDataSourceId: stripCollectionPrefix(
      merged.CODEX_CONVERSATIONAL_INSIGHTS_NOTION_DATA_SOURCE_ID || "",
    ),
    notionDatabaseId: merged.CODEX_CONVERSATIONAL_INSIGHTS_NOTION_DATABASE_ID || "",
    notionTags: parseList(merged.CODEX_CONVERSATIONAL_INSIGHTS_NOTION_TAGS),
    classifierModel: merged.CODEX_CONVERSATIONAL_INSIGHTS_MODEL || "gpt-5.4-mini",
    fallbackModel: merged.CODEX_CONVERSATIONAL_INSIGHTS_FALLBACK_MODEL || "",
    codexPath: merged.CODEX_CONVERSATIONAL_INSIGHTS_CODEX_PATH || defaultCodexPath(),
    backfillPromptModel: merged.CODEX_BACKFILL_PROMPT_MODEL || "gpt-5.5",
    backfillBatchSize: positiveInt(merged.CODEX_BACKFILL_BATCH_SIZE, 10),
    classifierTimeoutMs: positiveInt(merged.CODEX_CONVERSATIONAL_INSIGHTS_TIMEOUT_MS, 90_000),
    batchClassifierTimeoutMs: positiveInt(
      merged.CODEX_CONVERSATIONAL_INSIGHTS_BATCH_TIMEOUT_MS,
      180_000,
    ),
    notionMaxRetries: positiveInt(merged.CODEX_CONVERSATIONAL_INSIGHTS_NOTION_MAX_RETRIES, 8),
    notionMinRequestIntervalMs: nonNegativeInt(
      merged.CODEX_CONVERSATIONAL_INSIGHTS_NOTION_MIN_REQUEST_INTERVAL_MS,
      350,
    ),
    envFiles,
  }
}

function defaultCodexPath(): string {
  const appPath = "/Applications/Codex.app/Contents/Resources/codex"
  return fs.existsSync(appPath) ? appPath : "codex"
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function nonNegativeInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

export function legacyStatePath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(
    env.CODEX_HOME || path.join(os.homedir(), ".codex"),
    "conversational-insights",
    "state.json",
  )
}
