import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, expect, test } from "vitest"
import type { AppConfig } from "../src/config.js"
import { installDirect, uninstallDirect } from "../src/install-direct.js"

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

  test("uninstalls direct hook files and preserves state by default", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cci-uninstall-"))
    const repoRoot = path.join(tmp, "repo")
    const codexHome = path.join(tmp, "codex-home")
    const stateDir = path.join(codexHome, "conversational-insights")
    fs.mkdirSync(path.join(repoRoot, "dist"), { recursive: true })
    fs.mkdirSync(path.join(codexHome, "hooks"), { recursive: true })
    fs.mkdirSync(stateDir, { recursive: true })
    fs.writeFileSync(path.join(repoRoot, "dist", "cci.cjs"), "console.log('cci')\n")
    fs.writeFileSync(path.join(stateDir, "state.json"), JSON.stringify({ records: {} }))
    fs.writeFileSync(
      path.join(codexHome, "hooks", "codex-conversational-insights-hook.mjs"),
      "legacy\n",
    )
    fs.writeFileSync(
      path.join(codexHome, "hooks.json"),
      JSON.stringify({
        hooks: {
          UserPromptSubmit: [
            {
              hooks: [
                {
                  type: "command",
                  command: "node '/tmp/other-hook.mjs'",
                },
              ],
            },
          ],
        },
      }),
    )

    const config = { repoRoot, codexHome, stateDir } as AppConfig
    installDirect(config)
    const result = uninstallDirect(config)
    const registry = JSON.parse(fs.readFileSync(result.hooksJsonPath, "utf8"))

    expect(result.removedHookEntries).toBe(1)
    expect(result.removedInstalledDir).toBe(true)
    expect(result.removedLegacyFiles).toHaveLength(1)
    expect(result.removedStateDir).toBe(false)
    expect(fs.existsSync(path.join(codexHome, "hooks", "codex-conversational-insights"))).toBe(
      false,
    )
    expect(fs.existsSync(stateDir)).toBe(true)
    expect(registry.hooks.UserPromptSubmit[0].hooks[0].command).toBe("node '/tmp/other-hook.mjs'")
  })

  test("can remove state when explicitly requested", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cci-uninstall-state-"))
    const codexHome = path.join(tmp, "codex-home")
    const stateDir = path.join(codexHome, "conversational-insights")
    fs.mkdirSync(stateDir, { recursive: true })

    const result = uninstallDirect({ codexHome, stateDir } as AppConfig, { removeState: true })

    expect(result.removedStateDir).toBe(true)
    expect(fs.existsSync(stateDir)).toBe(false)
  })
})
