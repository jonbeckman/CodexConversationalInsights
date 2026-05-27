import type { Classification, HookInput, InsightRow, PromptSegment, StateRecord } from "./types.js"
import { compactPrompt, projectName } from "./utils.js"

export function buildInsightRow(
  input: HookInput,
  promptHash: string,
  classification: Classification,
): InsightRow {
  const capturedAt = new Date().toISOString()
  const cwd = input.cwd || process.cwd()
  return {
    insight: `${classification.workType} / ${classification.intent} - ${capturedAt.slice(0, 10)} - ${promptHash.slice(0, 8)}`,
    ...classification,
    promptHash,
    promptExcerpt: compactPrompt(input.prompt),
    capturedAt,
    cwd,
    project: projectName(cwd),
    sessionId: input.sessionId || "",
    promptModel: input.promptModel || "",
    transcriptPath: input.transcriptPath || "",
    notionTags: input.notionTags || [],
    skillsUsed: [],
    skillCount: 0,
    skillEvidence: "",
    source: input.source || "UserPromptSubmit",
    classifierModel: classification.model || "",
  }
}

export function rowToStateRecord(row: InsightRow): StateRecord {
  return {
    capturedAt: row.capturedAt,
    promptHash: row.promptHash,
    promptExcerpt: row.promptExcerpt,
    sessionId: row.sessionId,
    cwd: row.cwd,
    project: row.project,
    transcriptPath: row.transcriptPath,
    promptModel: row.promptModel,
    notionTags: row.notionTags,
    skillCount: row.skillCount,
    skillsUsed: row.skillsUsed,
    model: row.classifierModel,
  }
}

export function buildSkillPatch(
  segment: PromptSegment,
  record: StateRecord,
  sessionId: string,
  cwd: string,
  transcriptPath: string,
) {
  const skillsUsed = [...new Set(segment.skills.map((skill) => skill.key))].sort()
  return {
    promptHash: segment.promptHash,
    pageId: record.pageId || null,
    sessionId,
    cwd,
    project: projectName(cwd),
    transcriptPath,
    skillsUsed,
    skillCount: skillsUsed.length,
    skillEvidence: segment.skills
      .map((skill) => {
        const canonical = skill.name === skill.key ? skill.key : `${skill.key} (${skill.name})`
        return `${canonical}: ${skill.detectionMethod}; ${skill.evidence || "detected"}`
      })
      .join("\n")
      .slice(0, 2000),
  }
}
