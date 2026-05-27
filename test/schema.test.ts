import { describe, expect, test } from "vitest"
import { diffSchema } from "../src/schema.js"

describe("diffSchema", () => {
  test("reports missing properties and missing configured tag options", () => {
    const diff = diffSchema(
      {
        Insight: { type: "title" },
        Tags: { type: "multi_select", multi_select: { options: [{ name: "Personal" }] } },
      },
      ["Personal", "Consensys"],
    )

    expect(diff.conflicts).toEqual([])
    expect(diff.missing.some((property) => property.name === "Work Type")).toBe(true)
    expect(diff.missing.some((property) => property.name === "Category")).toBe(true)
    expect(diff.missingOptions).toContainEqual({
      name: "Tags",
      type: "multi_select",
      options: ["Consensys"],
    })
  })

  test("reports conflicting property types without treating them as missing", () => {
    const diff = diffSchema(
      {
        Insight: { type: "rich_text" },
      },
      [],
    )

    expect(diff.conflicts).toContainEqual({
      name: "Insight",
      expected: "title",
      actual: "rich_text",
    })
    expect(diff.missing.some((property) => property.name === "Insight")).toBe(false)
  })
})
