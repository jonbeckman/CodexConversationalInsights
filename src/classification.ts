import {
  categories,
  type Classification,
  intents,
  promptSpecificities,
  taskComplexities,
  workTypes,
} from "./types.js"
import { truncate } from "./utils.js"

export const classificationSchema = {
  type: "object",
  additionalProperties: false,
  required: ["workType", "intent", "category", "taskComplexity", "promptSpecificity"],
  properties: {
    workType: { type: "string", enum: workTypes },
    intent: { type: "string", enum: intents },
    category: { type: "string", enum: categories },
    taskComplexity: { type: "string", enum: taskComplexities },
    promptSpecificity: { type: "string", enum: promptSpecificities },
  },
} as const

export function batchClassificationSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["results"],
    properties: {
      results: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "index",
            "workType",
            "intent",
            "category",
            "taskComplexity",
            "promptSpecificity",
          ],
          properties: {
            index: { type: "integer", minimum: 0 },
            workType: { type: "string", enum: workTypes },
            intent: { type: "string", enum: intents },
            category: { type: "string", enum: categories },
            taskComplexity: { type: "string", enum: taskComplexities },
            promptSpecificity: { type: "string", enum: promptSpecificities },
          },
        },
      },
    },
  }
}

export function normalizeClassification(value: unknown): Classification {
  const parsed = value as Record<string, unknown>
  return {
    workType: requireAllowed(parsed.workType, workTypes, "workType"),
    intent: requireAllowed(parsed.intent, intents, "intent"),
    category: requireAllowed(parsed.category, categories, "category"),
    taskComplexity: requireAllowed(parsed.taskComplexity, taskComplexities, "taskComplexity"),
    promptSpecificity: requireAllowed(
      parsed.promptSpecificity,
      promptSpecificities,
      "promptSpecificity",
    ),
  }
}

function requireAllowed<const T extends string>(
  value: unknown,
  allowed: ReadonlyArray<T>,
  field: string,
): T {
  if (typeof value === "string" && allowed.includes(value as T)) return value as T
  throw new Error(`${field} must be one of ${allowed.join(", ")}, got ${JSON.stringify(value)}`)
}

export function buildClassifierPrompt(userPrompt: string): string {
  return `${classifierInstructions()}

User prompt:
${JSON.stringify(userPrompt)}`
}

export function buildBatchClassifierPrompt(userPrompts: ReadonlyArray<string>): string {
  const prompts = userPrompts.map((prompt, index) => ({ index, prompt }))
  return `${classifierInstructions()}

Return JSON with a top-level "results" array. Return exactly one result per input prompt, preserving each input index.

User prompts:
${JSON.stringify(prompts)}`
}

function classifierInstructions(): string {
  return `Classify the user's prompt for coding-conversation analytics.

Return only JSON matching the provided schema. Use exactly one allowed option for each field.

Definitions:
- Work Type:
  - Bug: investigating or fixing broken behavior, errors, crashes, or unexpected results.
  - KTLO: maintenance, updates, refactoring, tech debt reduction, dependency updates, code cleanup, or minor improvements that do not add new functionality.
  - Feature: building new functionality or adding capabilities that did not exist before.
- Intent:
  - Write Code: writing code and building features.
  - Ask: understanding the codebase or asking questions.
  - Plan: planning a feature or approach before implementation.
  - Task Automation: delegating common tasks like git commit, lint, build, create PR.
- Category:
  - Bug Fix, Feature, Refactoring, Testing, Documentation, Configuration, Ops and Deployment, Styling, Explanation, Performance.
- Task Complexity:
  - Trivial: very simple task, single file change, minimal code modification.
  - Low: easy task, 1-2 files, small amount of code.
  - Medium: medium difficulty, 3-10 files, editing related files.
  - High: hard task, cross-cutting concerns, many searches/edits, architectural changes.
- Prompt Specificity:
  - Low: minimal actionable guidance; vague or low-context.
  - Medium: some actionable guidance, usually one of code references, acceptance criteria, or constraints.
  - High: substantial actionable guidance, multiple evidence types, or clear and well-specified enough for success.`
}

export function parseJsonObject(text: string): unknown {
  const trimmed = text.trim()
  if (trimmed.startsWith("{")) return JSON.parse(trimmed)
  const match = trimmed.match(/\{[\s\S]*\}/u)
  if (!match) throw new Error("no JSON object found")
  return JSON.parse(match[0])
}

export function invalidClassifierJson(error: unknown, raw: string): string {
  const message = error instanceof Error ? error.message : String(error)
  return `invalid_classifier_json: ${message}; raw=${truncate(raw, 1000)}`
}
