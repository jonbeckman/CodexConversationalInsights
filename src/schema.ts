import { categories, intents, promptSpecificities, taskComplexities, workTypes } from "./types.js"

export type SchemaPropertyType =
  | "title"
  | "select"
  | "multi_select"
  | "rich_text"
  | "date"
  | "number"

export interface RequiredProperty {
  readonly name: string
  readonly type: SchemaPropertyType
  readonly options?: ReadonlyArray<string>
}

export interface SchemaDiff {
  readonly missing: ReadonlyArray<RequiredProperty>
  readonly conflicts: ReadonlyArray<{
    readonly name: string
    readonly expected: string
    readonly actual: string
  }>
  readonly missingOptions: ReadonlyArray<{
    readonly name: string
    readonly type: "select" | "multi_select"
    readonly options: ReadonlyArray<string>
  }>
}

export function requiredProperties(tags: ReadonlyArray<string>): ReadonlyArray<RequiredProperty> {
  return [
    { name: "Insight", type: "title" },
    { name: "Work Type", type: "select", options: workTypes },
    { name: "Intent", type: "select", options: intents },
    { name: "Category", type: "select", options: categories },
    { name: "Task Complexity", type: "select", options: taskComplexities },
    { name: "Prompt Specificity", type: "select", options: promptSpecificities },
    { name: "Prompt Hash", type: "rich_text" },
    { name: "Prompt Excerpt", type: "rich_text" },
    { name: "Captured At", type: "date" },
    { name: "CWD", type: "rich_text" },
    { name: "Project", type: "rich_text" },
    { name: "Session ID", type: "rich_text" },
    { name: "Prompt Model", type: "rich_text" },
    { name: "Transcript Path", type: "rich_text" },
    { name: "Tags", type: "multi_select", options: tags },
    { name: "Skills Used", type: "multi_select", options: [] },
    { name: "Skill Count", type: "number" },
    { name: "Skill Evidence", type: "rich_text" },
    { name: "Source", type: "select", options: ["UserPromptSubmit", "manual-backfill"] },
    { name: "Classifier Model", type: "rich_text" },
  ]
}

export function diffSchema(
  properties: Record<string, any>,
  tags: ReadonlyArray<string>,
): SchemaDiff {
  const missing: RequiredProperty[] = []
  const conflicts: Array<{
    readonly name: string
    readonly expected: string
    readonly actual: string
  }> = []
  const missingOptions: Array<{
    readonly name: string
    readonly type: "select" | "multi_select"
    readonly options: ReadonlyArray<string>
  }> = []
  for (const required of requiredProperties(tags)) {
    const existing = properties[required.name]
    if (!existing) {
      missing.push(required)
      continue
    }
    if (existing.type !== required.type) {
      conflicts.push({
        name: required.name,
        expected: required.type,
        actual: existing.type || "unknown",
      })
      continue
    }
    if (
      (required.type === "select" || required.type === "multi_select") &&
      required.options?.length
    ) {
      const existingOptions = new Set(
        (existing[required.type]?.options || []).map((option: { name: string }) => option.name),
      )
      const missingForProperty = required.options.filter((option) => !existingOptions.has(option))
      if (missingForProperty.length > 0) {
        missingOptions.push({
          name: required.name,
          type: required.type,
          options: missingForProperty,
        })
      }
    }
  }
  return { missing, conflicts, missingOptions }
}

export function propertyConfig(property: RequiredProperty): Record<string, unknown> {
  switch (property.type) {
    case "title":
      return { title: {} }
    case "rich_text":
      return { rich_text: {} }
    case "date":
      return { date: {} }
    case "number":
      return { number: { format: "number" } }
    case "select":
      return { select: { options: selectOptions(property.options || []) } }
    case "multi_select":
      return { multi_select: { options: selectOptions(property.options || []) } }
  }
}

export function optionUpdateConfig(
  type: "select" | "multi_select",
  existingOptions: ReadonlyArray<{ readonly name: string; readonly color?: string }>,
  missingOptions: ReadonlyArray<string>,
): Record<string, unknown> {
  const merged = [
    ...existingOptions.map((option) => ({ name: option.name, color: option.color || "default" })),
    ...selectOptions(missingOptions),
  ]
  return type === "select" ? { select: { options: merged } } : { multi_select: { options: merged } }
}

function selectOptions(
  options: ReadonlyArray<string>,
): ReadonlyArray<{ readonly name: string; readonly color: string }> {
  const colors = [
    "blue",
    "green",
    "yellow",
    "orange",
    "red",
    "purple",
    "pink",
    "brown",
    "gray",
  ] as const
  return options.map((name, index) => ({ name, color: colors[index % colors.length] }))
}
