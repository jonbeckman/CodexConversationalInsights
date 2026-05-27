import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, expect, test } from "vitest"
import { parseTranscript } from "../src/transcript.js"

describe("parseTranscript", () => {
  test("segments user prompts and detects announced and file-read skills", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cci-transcript-"))
    const transcript = path.join(
      tmp,
      "rollout-2026-01-01T00-00-00-019e6719-ec08-7a72-9c39-717911623c22.jsonl",
    )
    const lines = [
      { type: "session_meta", payload: { id: "session-1", cwd: "/tmp/project" } },
      { type: "turn_context", payload: { model: "gpt-5.5", cwd: "/tmp/project" } },
      {
        type: "response_item",
        payload: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "Build a thing" }],
        },
      },
      {
        type: "event_msg",
        payload: { type: "agent_message", message: "Using the `alpha-skill` skill for this." },
      },
      {
        type: "response_item",
        payload: {
          type: "function_call",
          name: "exec_command",
          arguments: '{"cmd":"sed -n \'1,20p\' /tmp/skills/beta-skill/SKILL.md"}',
        },
      },
      {
        type: "response_item",
        payload: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "Now explain it" }],
        },
      },
    ]
    fs.writeFileSync(transcript, lines.map((line) => JSON.stringify(line)).join("\n"))

    const summary = parseTranscript(transcript)

    expect(summary.sessionId).toBe("session-1")
    expect(summary.promptSegments).toHaveLength(2)
    expect(summary.promptSegments[0].skills.map((skill) => skill.key)).toEqual([
      "alpha-skill",
      "beta-skill",
    ])
    expect(summary.promptSegments[1].skills).toEqual([])
  })
})
