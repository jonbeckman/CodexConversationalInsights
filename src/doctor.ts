import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import type { AppConfig } from "./config.js"
import { retrieveDataSource } from "./notion.js"
import { diffSchema } from "./schema.js"
import { toErrorMessage } from "./utils.js"

export async function runDoctor(
  config: AppConfig,
  options: { readonly dryRun?: boolean } = {},
): Promise<Record<string, unknown>> {
  const checks: Record<string, unknown> = {
    node: process.version,
    repoRoot: config.repoRoot,
    pluginData: config.pluginData || null,
    statePath: config.statePath,
    logPath: config.logPath,
    distCliExists: fs.existsSync(path.join(config.repoRoot, "dist", "cci.cjs")),
    notionTokenPresent: Boolean(config.notionToken),
    notionDataSourceIdPresent: Boolean(config.notionDataSourceId),
    notionDatabaseIdPresent: Boolean(config.notionDatabaseId),
    notionTags: config.notionTags,
    codexPath: config.codexPath,
    codexAvailable: codexAvailable(config.codexPath),
    hooksJson: inspectHooks(config),
    dryRun: Boolean(options.dryRun),
  }
  if (config.notionToken && config.notionDataSourceId) {
    try {
      const dataSource = await retrieveDataSource(config)
      checks.notionReachable = true
      checks.notionSchema = diffSchema((dataSource as any).properties || {}, config.notionTags)
    } catch (error) {
      checks.notionReachable = false
      checks.notionError = toErrorMessage(error)
    }
  } else {
    checks.notionReachable = false
  }
  return checks
}

function codexAvailable(codexPath: string): boolean {
  const result = spawnSync(codexPath, ["--version"], { encoding: "utf8", timeout: 5000 })
  return !result.error && result.status === 0
}

function inspectHooks(config: AppConfig): Record<string, unknown> {
  const hooksJsonPath = path.join(config.codexHome, "hooks.json")
  try {
    const registry = JSON.parse(fs.readFileSync(hooksJsonPath, "utf8"))
    return {
      path: hooksJsonPath,
      exists: true,
      userPromptSubmitCount: registry.hooks?.UserPromptSubmit?.length || 0,
      stopCount: registry.hooks?.Stop?.length || 0,
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return { path: hooksJsonPath, exists: false }
    return { path: hooksJsonPath, exists: true, error: toErrorMessage(error) }
  }
}
