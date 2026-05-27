import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import type { AppConfig } from "./config.js"
import {
  batchClassificationSchema,
  buildBatchClassifierPrompt,
  buildClassifierPrompt,
  classificationSchema,
  invalidClassifierJson,
  normalizeClassification,
  parseJsonObject,
} from "./classification.js"
import type { Classification } from "./types.js"
import { truncate } from "./utils.js"

export interface ClassifierResult {
  readonly ok: true
  readonly classification: Classification
  readonly raw: string
}

export interface BatchClassifierResult {
  readonly ok: true
  readonly classifications: Map<string, Classification>
}

export interface ClassifierFailure {
  readonly ok: false
  readonly error: string
}

export function classifyPrompt(
  config: AppConfig,
  promptHash: string,
  prompt: string,
): ClassifierResult | ClassifierFailure {
  const models = [config.classifierModel, config.fallbackModel].filter(Boolean)
  let lastError = ""
  for (const model of models) {
    const result = runClassifier(config, model, prompt)
    if (result.ok) return result
    lastError = result.error
  }
  return { ok: false, error: lastError || "classifier_failed" }
}

export function classifyPromptsBatch(
  config: AppConfig,
  prompts: ReadonlyArray<{ readonly promptHash: string; readonly prompt: string }>,
): BatchClassifierResult | ClassifierFailure {
  const models = [config.classifierModel, config.fallbackModel].filter(Boolean)
  let lastError = ""
  for (const model of models) {
    const result = runBatchClassifier(config, model, prompts)
    if (result.ok) return result
    lastError = result.error
  }
  return { ok: false, error: lastError || "batch_classifier_failed" }
}

function runClassifier(
  config: AppConfig,
  model: string,
  prompt: string,
): ClassifierResult | ClassifierFailure {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-insights-"))
  const outputPath = path.join(tmpDir, "classification.json")
  const schemaPath = path.join(tmpDir, "schema.json")
  fs.writeFileSync(schemaPath, JSON.stringify(classificationSchema, null, 2))
  const result = spawnSync(config.codexPath, classifierArgs(model, schemaPath, outputPath), {
    input: buildClassifierPrompt(prompt),
    encoding: "utf8",
    timeout: config.classifierTimeoutMs,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, CODEX_CONVERSATIONAL_INSIGHTS_CHILD: "1" },
  })
  const raw = readOutput(outputPath, result.stdout)
  fs.rmSync(tmpDir, { recursive: true, force: true })
  if (result.error) return { ok: false, error: result.error.message }
  if (result.status !== 0)
    return { ok: false, error: truncate(`${result.stderr || ""}\n${result.stdout || ""}`, 4000) }
  try {
    const classification = normalizeClassification(parseJsonObject(raw))
    return { ok: true, classification: { ...classification, model }, raw }
  } catch (error) {
    return { ok: false, error: invalidClassifierJson(error, raw) }
  }
}

function runBatchClassifier(
  config: AppConfig,
  model: string,
  prompts: ReadonlyArray<{ readonly promptHash: string; readonly prompt: string }>,
): BatchClassifierResult | ClassifierFailure {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-insights-batch-"))
  const outputPath = path.join(tmpDir, "classifications.json")
  const schemaPath = path.join(tmpDir, "batch-schema.json")
  fs.writeFileSync(schemaPath, JSON.stringify(batchClassificationSchema(), null, 2))
  const result = spawnSync(config.codexPath, classifierArgs(model, schemaPath, outputPath), {
    input: buildBatchClassifierPrompt(prompts.map((item) => item.prompt)),
    encoding: "utf8",
    timeout: config.batchClassifierTimeoutMs,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, CODEX_CONVERSATIONAL_INSIGHTS_CHILD: "1" },
  })
  const raw = readOutput(outputPath, result.stdout)
  fs.rmSync(tmpDir, { recursive: true, force: true })
  if (result.error) return { ok: false, error: result.error.message }
  if (result.status !== 0)
    return { ok: false, error: truncate(`${result.stderr || ""}\n${result.stdout || ""}`, 4000) }
  try {
    const parsed = parseJsonObject(raw) as {
      readonly results?: ReadonlyArray<Record<string, unknown>>
    }
    const results = Array.isArray(parsed.results) ? parsed.results : []
    if (results.length !== prompts.length)
      throw new Error(`expected ${prompts.length} results, got ${results.length}`)
    const classifications = new Map<string, Classification>()
    for (const item of results) {
      const index = item.index
      if (!Number.isInteger(index) || index < 0 || index >= prompts.length) {
        throw new Error(`invalid result index ${JSON.stringify(index)}`)
      }
      classifications.set(prompts[index].promptHash, { ...normalizeClassification(item), model })
    }
    return { ok: true, classifications }
  } catch (error) {
    return { ok: false, error: invalidClassifierJson(error, raw) }
  }
}

function classifierArgs(
  model: string,
  schemaPath: string,
  outputPath: string,
): ReadonlyArray<string> {
  return [
    "exec",
    "-m",
    model,
    "--skip-git-repo-check",
    "--ephemeral",
    "--ignore-rules",
    "-s",
    "read-only",
    "-c",
    'approval_policy="never"',
    "-C",
    process.cwd(),
    "--output-schema",
    schemaPath,
    "-o",
    outputPath,
    "-",
  ]
}

function readOutput(outputPath: string, fallback: string | null): string {
  try {
    return fs.readFileSync(outputPath, "utf8").trim()
  } catch {
    return (fallback || "").trim()
  }
}
