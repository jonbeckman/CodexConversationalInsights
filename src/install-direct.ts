import fs from "node:fs"
import path from "node:path"
import type { AppConfig } from "./config.js"

export interface InstallDirectResult {
  readonly installedCli: string
  readonly hooksJsonPath: string
  readonly command: string
  readonly userPromptSubmitHookCount: number
  readonly stopHookCount: number
}

export function installDirect(config: AppConfig): InstallDirectResult {
  const sourceCli = path.join(config.repoRoot, "dist", "cci.cjs")
  if (!fs.existsSync(sourceCli)) {
    throw new Error("dist/cci.cjs does not exist. Run pnpm build before install-direct.")
  }
  const installDir = path.join(config.codexHome, "hooks", "codex-conversational-insights")
  const installedCli = path.join(installDir, "cci.cjs")
  fs.mkdirSync(installDir, { recursive: true, mode: 0o700 })
  fs.copyFileSync(sourceCli, installedCli)
  fs.chmodSync(installedCli, 0o755)

  const envFile = path.join(config.repoRoot, ".env")
  const envPrefix = fs.existsSync(envFile)
    ? `CODEX_CONVERSATIONAL_INSIGHTS_ENV_FILE='${escapeSingleQuoted(envFile)}' `
    : ""
  const command = `${envPrefix}node '${escapeSingleQuoted(installedCli)}' hook user-prompt-submit`
  const hooksJsonPath = path.join(config.codexHome, "hooks.json")
  const registry = readHookRegistry(hooksJsonPath)
  registry.hooks ||= {}
  upsertHook(registry, "UserPromptSubmit", {
    type: "command",
    command,
    timeout: 120,
    statusMessage: "Classifying Codex conversational insight",
  })
  removeHook(registry, "Stop")
  fs.mkdirSync(path.dirname(hooksJsonPath), { recursive: true, mode: 0o700 })
  fs.writeFileSync(hooksJsonPath, `${JSON.stringify(registry, null, 2)}\n`, { mode: 0o644 })
  return {
    installedCli,
    hooksJsonPath,
    command,
    userPromptSubmitHookCount: registry.hooks.UserPromptSubmit?.length || 0,
    stopHookCount: registry.hooks.Stop?.length || 0,
  }
}

function readHookRegistry(hooksJsonPath: string): {
  hooks: Record<string, Array<{ matcher?: string; hooks?: any[] }>>
} {
  try {
    return JSON.parse(fs.readFileSync(hooksJsonPath, "utf8"))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { hooks: {} }
    throw error
  }
}

function upsertHook(
  registry: { hooks: Record<string, Array<{ matcher?: string; hooks?: any[] }>> },
  eventName: string,
  hookEntry: any,
): void {
  registry.hooks[eventName] ||= []
  let group = registry.hooks[eventName].find((entry) => !entry.matcher)
  if (!group) {
    group = { hooks: [] }
    registry.hooks[eventName].push(group)
  }
  group.hooks ||= []
  group.hooks = group.hooks.filter((hook) => {
    if (hook.type !== "command") return true
    const existing = String(hook.command || "")
    return (
      !existing.includes("codex-conversational-insights") &&
      !existing.includes("codex-skill-usage-hook")
    )
  })
  group.hooks.push(hookEntry)
}

function removeHook(
  registry: { hooks: Record<string, Array<{ matcher?: string; hooks?: any[] }>> },
  eventName: string,
): void {
  registry.hooks[eventName] ||= []
  for (const group of registry.hooks[eventName]) {
    group.hooks ||= []
    group.hooks = group.hooks.filter((hook) => {
      if (hook.type !== "command") return true
      const existing = String(hook.command || "")
      return (
        !existing.includes("codex-conversational-insights") &&
        !existing.includes("codex-skill-usage-hook")
      )
    })
  }
  registry.hooks[eventName] = registry.hooks[eventName].filter(
    (group) => group.matcher || (group.hooks && group.hooks.length > 0),
  )
  if (registry.hooks[eventName].length === 0) delete registry.hooks[eventName]
}

function escapeSingleQuoted(value: string): string {
  return value.replace(/'/gu, "'\\''")
}
