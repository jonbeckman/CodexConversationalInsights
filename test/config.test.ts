import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, expect, test } from "vitest"
import { loadConfig } from "../src/config.js"

describe("loadConfig", () => {
  test("process env overrides configured env file values", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cci-config-"))
    const envFile = path.join(tmp, ".env")
    fs.writeFileSync(
      envFile,
      [
        "NOTION_TOKEN=file-token",
        "CODEX_CONVERSATIONAL_INSIGHTS_NOTION_DATA_SOURCE_ID=collection://from-file",
        "CODEX_CONVERSATIONAL_INSIGHTS_NOTION_TAGS=Personal",
      ].join("\n"),
    )

    const config = loadConfig({
      CODEX_CONVERSATIONAL_INSIGHTS_ENV_FILE: envFile,
      CODEX_CONVERSATIONAL_INSIGHTS_NOTION_DATA_SOURCE_ID: "from-process",
      CODEX_CONVERSATIONAL_INSIGHTS_NOTION_TAGS: "Consensys,Work",
      CODEX_HOME: path.join(tmp, "codex-home"),
      PATH: process.env.PATH,
    })

    expect(config.notionToken).toBe("file-token")
    expect(config.notionDataSourceId).toBe("from-process")
    expect(config.notionTags).toEqual(["Consensys", "Work"])
  })
})
