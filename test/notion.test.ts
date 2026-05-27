import { describe, expect, test } from "vitest"
import type { AppConfig } from "../src/config.js"
import { notionCall } from "../src/notion.js"

describe("notionCall", () => {
  test("retries rate-limited calls", async () => {
    const config = {
      notionMaxRetries: 2,
      notionMinRequestIntervalMs: 0,
    } as AppConfig
    let attempts = 0

    const result = await notionCall(config, async () => {
      attempts += 1
      if (attempts < 3) throw { status: 429 }
      return "ok"
    })

    expect(result).toBe("ok")
    expect(attempts).toBe(3)
  })
})
