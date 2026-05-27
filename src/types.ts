export const workTypes = ["Bug", "KTLO", "Feature"] as const
export const intents = ["Write Code", "Ask", "Plan", "Task Automation"] as const
export const categories = [
  "Bug Fix",
  "Feature",
  "Refactoring",
  "Testing",
  "Documentation",
  "Configuration",
  "Ops and Deployment",
  "Styling",
  "Explanation",
  "Performance",
] as const
export const taskComplexities = ["Trivial", "Low", "Medium", "High"] as const
export const promptSpecificities = ["Low", "Medium", "High"] as const

export type WorkType = (typeof workTypes)[number]
export type Intent = (typeof intents)[number]
export type Category = (typeof categories)[number]
export type TaskComplexity = (typeof taskComplexities)[number]
export type PromptSpecificity = (typeof promptSpecificities)[number]

export interface Classification {
  readonly workType: WorkType
  readonly intent: Intent
  readonly category: Category
  readonly taskComplexity: TaskComplexity
  readonly promptSpecificity: PromptSpecificity
  readonly model?: string
}

export interface HookInput {
  readonly prompt: string
  readonly cwd: string
  readonly sessionId: string
  readonly promptModel: string
  readonly transcriptPath: string
  readonly source?: string
  readonly notionTags?: ReadonlyArray<string>
}

export interface InsightRow extends Classification {
  readonly insight: string
  readonly promptHash: string
  readonly promptExcerpt: string
  readonly capturedAt: string
  readonly cwd: string
  readonly project: string
  readonly sessionId: string
  readonly promptModel: string
  readonly transcriptPath: string
  readonly notionTags: ReadonlyArray<string>
  readonly skillsUsed: ReadonlyArray<string>
  readonly skillCount: number
  readonly skillEvidence: string
  readonly source: string
  readonly classifierModel: string
}

export interface StateRecord {
  readonly capturedAt?: string
  readonly pageId?: string | null
  readonly promptHash?: string
  readonly promptExcerpt?: string
  readonly sessionId?: string
  readonly cwd?: string
  readonly project?: string
  readonly transcriptPath?: string
  readonly promptModel?: string
  readonly notionTags?: ReadonlyArray<string>
  readonly skillCount?: number
  readonly skillsUsed?: ReadonlyArray<string>
  readonly model?: string
}

export interface InsightsState {
  readonly version?: number
  readonly records: Record<string, StateRecord>
  readonly modelFailures?: Record<string, { readonly at: number; readonly error: string }>
  readonly migratedFrom?: string
}

export interface TranscriptSkill {
  readonly key: string
  readonly name: string
  readonly detectionMethod: string
  readonly evidence: string
}

export interface PromptSegment {
  readonly prompt: string
  readonly promptHash: string
  readonly promptExcerpt: string
  readonly promptModel: string
  readonly skills: ReadonlyArray<TranscriptSkill>
}

export interface TranscriptSummary {
  readonly transcriptPath: string
  readonly sessionId: string
  readonly cwd: string
  readonly project: string
  readonly promptModel: string
  readonly promptSegments: ReadonlyArray<PromptSegment>
}
