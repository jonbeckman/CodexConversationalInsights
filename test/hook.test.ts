import { afterEach, describe, expect, test } from "vitest"
import type { AppConfig } from "../src/config.js"
import { runUserPromptSubmitHook } from "../src/backfill.js"

const originalChild = process.env.CODEX_CONVERSATIONAL_INSIGHTS_CHILD

afterEach(() => {
  if (originalChild === undefined) delete process.env.CODEX_CONVERSATIONAL_INSIGHTS_CHILD
  else process.env.CODEX_CONVERSATIONAL_INSIGHTS_CHILD = originalChild
})

describe("runUserPromptSubmitHook", () => {
  test("skips classifier child sessions to prevent recursion", async () => {
    process.env.CODEX_CONVERSATIONAL_INSIGHTS_CHILD = "1"

    const result = await runUserPromptSubmitHook({
      logPath: "/tmp/cci-test-events.jsonl",
    } as AppConfig)

    expect(result).toEqual({ status: "skipped", reason: "child_classifier_session" })
  })
})
