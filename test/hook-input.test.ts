import { describe, expect, test } from "vitest"
import type { AppConfig } from "../src/config.js"
import { parseHookInput } from "../src/hook-input.js"

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
})
