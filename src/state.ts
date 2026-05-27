import fs from "node:fs"
import path from "node:path"
import { type AppConfig, legacyStatePath } from "./config.js"
import type { InsightsState } from "./types.js"
import { readJsonFile, writeJsonFile } from "./utils.js"

export function readState(config: AppConfig): InsightsState {
  migrateLegacyStateIfNeeded(config)
  return readJsonFile<InsightsState>(config.statePath, { version: 1, records: {} })
}

export function writeState(config: AppConfig, state: InsightsState): void {
  writeJsonFile(config.statePath, { version: 1, ...state })
}

function migrateLegacyStateIfNeeded(config: AppConfig): void {
  if (fs.existsSync(config.statePath)) return
  const legacyPath = legacyStatePath()
  if (path.resolve(legacyPath) === path.resolve(config.statePath)) return
  if (!fs.existsSync(legacyPath)) return
  fs.mkdirSync(path.dirname(config.statePath), { recursive: true, mode: 0o700 })
  const legacy = readJsonFile<InsightsState>(legacyPath, { version: 1, records: {} })
  writeJsonFile(config.statePath, {
    ...legacy,
    version: 1,
    migratedFrom: legacyPath,
  })
}
