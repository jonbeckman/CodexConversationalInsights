import { describe, expect, test } from "vitest"
import type { AppConfig } from "../src/config.js"
import { isCodexAutomationInput, parseHookInput } from "../src/hook-input.js"

describe("parseHookInput", () => {
  test("accepts Codex-style snake case input and config tags", () => {
    const input = parseHookInput(
      { notionTags: ["Consensys"], sessionsDir: "/does/not/exist" } as unknown as AppConfig,
      JSON.stringify({
        prompt: "Fix it",
        cwd: "/tmp/project",
        session_id: "session-1",
        transcript_path: "/tmp/transcript.jsonl",
        model: "gpt-5.5",
      }),
      {},
    )

    expect(input).toMatchObject({
      prompt: "Fix it",
      cwd: "/tmp/project",
      sessionId: "session-1",
      transcriptPath: "/tmp/transcript.jsonl",
      promptModel: "gpt-5.5",
      notionTags: ["Consensys"],
    })
  })

  test("detects heartbeat automation wrapper prompts", () => {
    const input = parseHookInput(
      { notionTags: [], sessionsDir: "/does/not/exist" } as unknown as AppConfig,
      JSON.stringify({
        prompt:
          "<heartbeat><automation_id>daily-summary</automation_id><instructions>Run it</instructions></heartbeat>",
      }),
      {},
    )

    expect(isCodexAutomationInput(input)).toBe(true)
  })

  test("detects explicit automation id payloads", () => {
    const input = parseHookInput(
      { notionTags: [], sessionsDir: "/does/not/exist" } as unknown as AppConfig,
      JSON.stringify({
        prompt: "Run it",
        automation_id: "daily-summary",
      }),
      {},
    )

    expect(input.automationId).toBe("daily-summary")
    expect(isCodexAutomationInput(input)).toBe(true)
  })

  test("detects legacy automation prompt headers", () => {
    const input = parseHookInput(
      { notionTags: [], sessionsDir: "/does/not/exist" } as unknown as AppConfig,
      "Automation: Daily Wiki Maintenance\nAutomation ID: daily-wiki-maintenance\nRun it",
      {},
    )

    expect(isCodexAutomationInput(input)).toBe(true)
  })
})
