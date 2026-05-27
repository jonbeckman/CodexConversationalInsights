import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, expect, test } from "vitest"
import type { AppConfig } from "../src/config.js"
import { installDirect } from "../src/install-direct.js"

describe("installDirect", () => {
  test("copies bundled CLI and upserts only UserPromptSubmit", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cci-install-"))
    const repoRoot = path.join(tmp, "repo")
    const codexHome = path.join(tmp, "codex-home")
    fs.mkdirSync(path.join(repoRoot, "dist"), { recursive: true })
    fs.writeFileSync(path.join(repoRoot, "dist", "cci.cjs"), "console.log('cci')\n")
    fs.writeFileSync(path.join(repoRoot, ".env"), "NOTION_TOKEN=secret\n")

    const result = installDirect({ repoRoot, codexHome } as AppConfig)
    const registry = JSON.parse(fs.readFileSync(result.hooksJsonPath, "utf8"))

    expect(fs.existsSync(result.installedCli)).toBe(true)
    expect(registry.hooks.UserPromptSubmit[0].hooks[0].command).toContain(
      "CODEX_CONVERSATIONAL_INSIGHTS_ENV_FILE=",
    )
    expect(registry.hooks.Stop).toBeUndefined()
  })
})
