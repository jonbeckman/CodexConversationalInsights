import type { AppConfig } from "./config.js"
import { classifyPrompt, classifyPromptsBatch } from "./codex-runner.js"
import { isCodexAutomationInput, parseHookInput } from "./hook-input.js"
import { logEvent } from "./logging.js"
import { createInsightPage, updateInsightPage } from "./notion.js"
import { buildInsightRow, buildSkillPatch, rowToStateRecord } from "./rows.js"
import { readState, writeState } from "./state.js"
import type { HookInput, PromptSegment, TranscriptSummary } from "./types.js"
import { parseTranscript } from "./transcript.js"
import { hashPrompt, sameList, toErrorMessage } from "./utils.js"

export interface RuntimeOptions {
  readonly dryRun?: boolean
  readonly noNotion?: boolean
  readonly summary?: boolean
}

export interface BackfillStats {
  readonly scope: string
  sessions: number
  candidatePrompts: number
  skippedExisting: number
  updatedExistingMetadata: number
  updatedStateOnlyMetadata: number
  created: number
  dryRunRows: number
  errors: number
  paths: ReadonlyArray<string>
}

export async function runUserPromptSubmitHook(
  config: AppConfig,
  options: RuntimeOptions = {},
): Promise<Record<string, unknown>> {
  if (process.env.CODEX_CONVERSATIONAL_INSIGHTS_CHILD === "1") {
    logEvent(config, "skip", { reason: "child_classifier_session" })
    return { status: "skipped", reason: "child_classifier_session" }
  }
  const input = parseHookInput(config)
  if (!config.includeAutomations && isCodexAutomationInput(input)) {
    logEvent(config, "skip", {
      reason: "codex_automation",
      automationId: input.automationId || automationIdFromPrompt(input.prompt),
    })
    return {
      status: "skipped",
      reason: "codex_automation",
      automationId: input.automationId || automationIdFromPrompt(input.prompt),
    }
  }
  if (input.transcriptPath) await captureSkills(config, input.transcriptPath, options)
  if (!input.prompt) {
    logEvent(config, "skip", { reason: "no_prompt" })
    return { status: "skipped", reason: "no_prompt" }
  }
  return capturePrompt(config, input, options)
}

function automationIdFromPrompt(prompt: string): string {
  return prompt.match(/<automation_id>([^<]+)<\/automation_id>/u)?.[1]?.trim() || ""
}

export async function capturePrompt(
  config: AppConfig,
  input: HookInput,
  options: RuntimeOptions = {},
): Promise<Record<string, unknown>> {
  const promptHash = hashPrompt(input.prompt)
  const state = readState(config)
  if (state.records[promptHash]?.pageId) {
    return { status: "skipped_existing", promptHash }
  }
  const classification = classifyPrompt(config, promptHash, input.prompt)
  if (!classification.ok) throw new Error(classification.error)
  const row = buildInsightRow(
    { ...input, notionTags: config.notionTags },
    promptHash,
    classification.classification,
  )
  if (options.dryRun || options.noNotion) {
    return { status: "dry_run", row }
  }
  if (!config.notionToken || !config.notionDataSourceId) {
    logEvent(config, "skip", { reason: "missing_notion_config", promptHash })
    return { status: "skipped", reason: "missing_notion_config", promptHash }
  }
  const response = await createInsightPage(config, row)
  writeState(config, {
    ...state,
    records: {
      ...state.records,
      [promptHash]: { ...rowToStateRecord(row), pageId: response.id },
    },
  })
  logEvent(config, "recorded", {
    promptHash,
    pageId: response.id,
    classifierModel: row.classifierModel,
  })
  return { status: "created", promptHash, pageId: response.id }
}

export async function backfillTranscripts(
  config: AppConfig,
  transcriptPaths: ReadonlyArray<string>,
  scope: string,
  options: RuntimeOptions = {},
): Promise<{
  readonly stats: BackfillStats
  readonly candidates?: ReadonlyArray<Record<string, unknown>>
}> {
  const stats: BackfillStats = {
    scope,
    sessions: transcriptPaths.length,
    candidatePrompts: 0,
    skippedExisting: 0,
    updatedExistingMetadata: 0,
    updatedStateOnlyMetadata: 0,
    created: 0,
    dryRunRows: 0,
    errors: 0,
    paths: transcriptPaths,
  }

  const pendingInputs: HookInput[] = []
  const candidates: Record<string, unknown>[] = []
  for (const transcriptPath of transcriptPaths) {
    const summary = parseTranscript(transcriptPath)
    for (const segment of summary.promptSegments) {
      stats.candidatePrompts += 1
      const state = readState(config)
      const exists = Boolean(state.records[segment.promptHash])
      if (exists) {
        stats.skippedExisting += 1
        if (
          !options.dryRun &&
          !options.noNotion &&
          (await updateExistingBackfillMetadata(config, state, segment, summary))
        ) {
          stats.updatedExistingMetadata += 1
        }
      } else {
        stats.dryRunRows += options.dryRun || options.noNotion ? 1 : 0
        pendingInputs.push(segmentToInput(config, summary, segment))
      }
      if (options.dryRun && !options.summary) {
        candidates.push({
          promptHash: segment.promptHash,
          exists,
          sessionId: summary.sessionId,
          promptModel: segment.promptModel || config.backfillPromptModel,
          notionTags: config.notionTags,
          cwd: summary.cwd,
          transcriptPath,
          promptExcerpt: segment.promptExcerpt,
          skillsUsed: segment.skills.map((skill) => skill.key),
        })
      }
    }
  }

  if (!options.dryRun && !options.noNotion) {
    await capturePromptBatch(config, pendingInputs, stats)
    for (const transcriptPath of transcriptPaths) {
      await captureSkills(config, transcriptPath, options)
    }
    stats.updatedStateOnlyMetadata = await syncStateMetadata(config, options)
  }

  return { stats, candidates: options.dryRun && !options.summary ? candidates : undefined }
}

export async function syncStateMetadata(
  config: AppConfig,
  options: RuntimeOptions = {},
): Promise<number> {
  if (options.dryRun || options.noNotion) return 0
  const state = readState(config)
  const entries = Object.entries(state.records).filter(
    ([, record]) => record.pageId && !sameList(record.notionTags || [], config.notionTags),
  )
  let updated = 0
  for (const [promptHash, record] of entries) {
    await updateInsightPage(config, record.pageId as string, { notionTags: config.notionTags })
    const latestState = readState(config)
    writeState(config, {
      ...latestState,
      records: {
        ...latestState.records,
        [promptHash]: {
          ...latestState.records[promptHash],
          notionTags: config.notionTags,
        },
      },
    })
    updated += 1
  }
  return updated
}

export async function captureSkills(
  config: AppConfig,
  transcriptPath: string,
  options: RuntimeOptions = {},
): Promise<ReadonlyArray<Record<string, unknown>>> {
  const summary = parseTranscript(transcriptPath)
  const rows: Record<string, unknown>[] = []
  for (const segment of summary.promptSegments) {
    if (segment.skills.length === 0) continue
    const state = readState(config)
    const record = state.records[segment.promptHash]
    if (!record?.pageId) continue
    const patch = buildSkillPatch(segment, record, summary.sessionId, summary.cwd, transcriptPath)
    rows.push(patch)
    if (options.dryRun || options.noNotion) continue
    await updateInsightPage(config, record.pageId, patch)
    const latestState = readState(config)
    writeState(config, {
      ...latestState,
      records: {
        ...latestState.records,
        [segment.promptHash]: {
          ...latestState.records[segment.promptHash],
          sessionId: patch.sessionId,
          cwd: patch.cwd,
          project: patch.project,
          transcriptPath: patch.transcriptPath,
          skillsUsed: patch.skillsUsed,
          skillCount: patch.skillCount,
        },
      },
    })
    logEvent(config, "skills_recorded", {
      promptHash: segment.promptHash,
      pageId: record.pageId,
      skills: patch.skillsUsed,
    })
  }
  return rows
}

async function capturePromptBatch(
  config: AppConfig,
  inputs: ReadonlyArray<HookInput>,
  stats: BackfillStats,
): Promise<void> {
  for (let index = 0; index < inputs.length; index += config.backfillBatchSize) {
    const chunk = inputs.slice(index, index + config.backfillBatchSize)
    const state = readState(config)
    const missing = chunk.filter((input) => !state.records[hashPrompt(input.prompt)])
    if (missing.length === 0) {
      stats.skippedExisting += chunk.length
      continue
    }
    const batch = classifyPromptsBatch(
      config,
      missing.map((input) => ({ promptHash: hashPrompt(input.prompt), prompt: input.prompt })),
    )
    if (!batch.ok) {
      for (const input of missing) {
        try {
          const result = await capturePrompt(config, input)
          if (result.status === "created") stats.created += 1
        } catch (error) {
          stats.errors += 1
          logEvent(config, "error", {
            reason: "backfill_prompt_failed",
            message: toErrorMessage(error),
          })
        }
      }
      continue
    }
    for (const input of missing) {
      try {
        const promptHash = hashPrompt(input.prompt)
        const classification = batch.classifications.get(promptHash)
        if (!classification) throw new Error("missing_batch_classification")
        const row = buildInsightRow(
          { ...input, notionTags: config.notionTags },
          promptHash,
          classification,
        )
        const response = await createInsightPage(config, row)
        const latestState = readState(config)
        writeState(config, {
          ...latestState,
          records: {
            ...latestState.records,
            [promptHash]: { ...rowToStateRecord(row), pageId: response.id },
          },
        })
        stats.created += 1
      } catch (error) {
        stats.errors += 1
        logEvent(config, "error", {
          reason: "backfill_prompt_create_failed",
          message: toErrorMessage(error),
        })
      }
    }
  }
}

async function updateExistingBackfillMetadata(
  config: AppConfig,
  state: ReturnType<typeof readState>,
  segment: PromptSegment,
  summary: TranscriptSummary,
): Promise<boolean> {
  const record = state.records[segment.promptHash]
  if (!record?.pageId) return false
  const promptModel = segment.promptModel || config.backfillPromptModel
  const needsPromptModelUpdate = record.promptModel !== promptModel
  const needsTagsUpdate = !sameList(record.notionTags || [], config.notionTags)
  if (!needsPromptModelUpdate && !needsTagsUpdate) return false
  await updateInsightPage(config, record.pageId, {
    promptModel: needsPromptModelUpdate ? promptModel : record.promptModel,
    notionTags: needsTagsUpdate ? config.notionTags : record.notionTags,
    transcriptPath: summary.transcriptPath,
  })
  writeState(config, {
    ...state,
    records: {
      ...state.records,
      [segment.promptHash]: {
        ...record,
        promptModel: needsPromptModelUpdate ? promptModel : record.promptModel,
        notionTags: needsTagsUpdate ? config.notionTags : record.notionTags,
        transcriptPath: summary.transcriptPath,
      },
    },
  })
  return true
}

function segmentToInput(
  config: AppConfig,
  summary: TranscriptSummary,
  segment: PromptSegment,
): HookInput {
  return {
    prompt: segment.prompt,
    cwd: summary.cwd || process.cwd(),
    sessionId: summary.sessionId,
    promptModel: segment.promptModel || config.backfillPromptModel,
    transcriptPath: summary.transcriptPath,
    notionTags: config.notionTags,
    source: "manual-backfill",
  }
}
