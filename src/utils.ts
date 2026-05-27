import { createHash } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

export function hashPrompt(prompt: string): string {
  return createHash("sha256").update(prompt).digest("hex")
}

export function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value
}

export function compactPrompt(prompt: string): string {
  return truncate(prompt.replace(/\s+/gu, " ").trim(), 500)
}

export function compactEvidence(text: string): string {
  return truncate(text.replace(/\s+/gu, " ").trim(), 450)
}

export function projectName(cwd: string): string {
  return path.basename(cwd || process.cwd())
}

export function parseList(value: string | undefined): ReadonlyArray<string> {
  return [
    ...new Set(
      String(value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ]
}

export function sameList(
  left: ReadonlyArray<string> = [],
  right: ReadonlyArray<string> = [],
): boolean {
  const a = [...new Set(left)].sort()
  const b = [...new Set(right)].sort()
  return a.length === b.length && a.every((value, index) => value === b[index])
}

export function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback
    throw error
  }
}

export function writeJsonFile(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 })
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function findCodexHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.CODEX_HOME || path.join(os.homedir(), ".codex")
}

export function findNearestPackageRoot(start: string): string | null {
  let current = start
  while (true) {
    if (fs.existsSync(path.join(current, "package.json"))) return current
    const next = path.dirname(current)
    if (next === current) return null
    current = next
  }
}

export function stripCollectionPrefix(value: string): string {
  return value.startsWith("collection://") ? value.slice("collection://".length) : value
}

export function firstString(...values: ReadonlyArray<unknown>): string {
  return (values.find((value) => typeof value === "string" && value.trim()) as string) || ""
}

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
