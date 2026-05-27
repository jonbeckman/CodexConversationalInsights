import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, test } from "vitest"
import { loadConfig } from "../src/config.js"
import { readState } from "../src/state.js"

const originalCodexHome = process.env.CODEX_HOME

afterEach(() => {
  if (originalCodexHome === undefined) delete process.env.CODEX_HOME
  else process.env.CODEX_HOME = originalCodexHome
})

describe("readState", () => {
  test("auto-migrates legacy state into plugin data when empty", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cci-state-"))
    const codexHome = path.join(tmp, "codex-home")
    const pluginData = path.join(tmp, "plugin-data")
    const legacyDir = path.join(codexHome, "conversational-insights")
    fs.mkdirSync(legacyDir, { recursive: true })
    fs.writeFileSync(
      path.join(legacyDir, "state.json"),
      JSON.stringify({ version: 1, records: { abc: { pageId: "page-1" } } }),
    )
    process.env.CODEX_HOME = codexHome

    const config = loadConfig({
      CODEX_HOME: codexHome,
      PLUGIN_DATA: pluginData,
      PATH: process.env.PATH,
    })
    const state = readState(config)

    expect(state.records.abc?.pageId).toBe("page-1")
    expect(fs.existsSync(path.join(pluginData, "state.json"))).toBe(true)
  })
})
