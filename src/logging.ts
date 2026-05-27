import fs from "node:fs"
import path from "node:path"
import type { AppConfig } from "./config.js"

export function logEvent(
  config: AppConfig,
  type: string,
  payload: Record<string, unknown> = {},
): void {
  fs.mkdirSync(path.dirname(config.logPath), { recursive: true, mode: 0o700 })
  fs.appendFileSync(
    config.logPath,
    `${JSON.stringify({
      timestamp: new Date().toISOString(),
      type,
      ...payload,
    })}\n`,
  )
}
