import { APIResponseError, Client } from "@notionhq/client"
import type { AppConfig } from "./config.js"
import { diffSchema, optionUpdateConfig, propertyConfig } from "./schema.js"
import type { InsightRow } from "./types.js"
import { sleep, truncate } from "./utils.js"

let lastNotionRequestAt = 0

export function createNotionClient(config: AppConfig): Client {
  return new Client({
    auth: config.notionToken,
    notionVersion: config.notionVersion,
  })
}

export async function createInsightPage(
  config: AppConfig,
  row: InsightRow,
): Promise<{ readonly id: string }> {
  const client = createNotionClient(config)
  try {
    const response = await notionCall(config, () =>
      client.pages.create({
        parent: { data_source_id: config.notionDataSourceId },
        properties: notionPageProperties(row),
      } as any),
    )
    return { id: response.id }
  } catch (error) {
    if (!config.notionDatabaseId) throw error
    const response = await notionCall(config, () =>
      client.pages.create({
        parent: { database_id: config.notionDatabaseId },
        properties: notionPageProperties(row),
      } as any),
    )
    return { id: response.id }
  }
}

export async function updateInsightPage(
  config: AppConfig,
  pageId: string,
  patch: Partial<InsightRow> & {
    readonly skillsUsed?: ReadonlyArray<string>
    readonly skillCount?: number
    readonly skillEvidence?: string
  },
): Promise<void> {
  const client = createNotionClient(config)
  await notionCall(config, () =>
    client.pages.update({
      page_id: pageId,
      properties: notionPatchProperties(patch),
    } as any),
  )
}

export async function retrievePageTags(
  config: AppConfig,
  pageId: string,
): Promise<ReadonlyArray<string>> {
  const client = createNotionClient(config)
  const page = await notionCall(config, () => client.pages.retrieve({ page_id: pageId }))
  const properties = (page as any).properties || {}
  return (properties.Tags?.multi_select || []).map((tag: { name: string }) => tag.name)
}

export async function retrieveDataSource(config: AppConfig): Promise<any> {
  const client = createNotionClient(config)
  return notionCall(config, () =>
    client.dataSources.retrieve({ data_source_id: config.notionDataSourceId }),
  )
}

export async function provisionDataSource(config: AppConfig): Promise<Record<string, unknown>> {
  const client = createNotionClient(config)
  const dataSource = await retrieveDataSource(config)
  const diff = diffSchema(dataSource.properties || {}, config.notionTags)
  if (diff.conflicts.length > 0) {
    return { ok: false, changed: false, diff }
  }

  const properties: Record<string, any> = {}
  for (const property of diff.missing) {
    properties[property.name] = propertyConfig(property)
  }
  for (const item of diff.missingOptions) {
    const existing = dataSource.properties[item.name]?.[item.type]?.options || []
    properties[item.name] = optionUpdateConfig(item.type, existing, item.options)
  }
  if (Object.keys(properties).length > 0) {
    await notionCall(config, () =>
      client.dataSources.update({
        data_source_id: config.notionDataSourceId,
        properties,
      } as any),
    )
  }
  return { ok: true, changed: Object.keys(properties).length > 0, diff }
}

export async function notionCall<T>(config: AppConfig, action: () => Promise<T>): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= config.notionMaxRetries; attempt += 1) {
    await pace(config)
    try {
      return await action()
    } catch (error) {
      lastError = error
      if (!shouldRetry(error) || attempt === config.notionMaxRetries) throw error
      await sleep(retryDelayMs(error, attempt))
    }
  }
  throw lastError
}

function notionPageProperties(row: InsightRow): Record<string, any> {
  return {
    Insight: title(row.insight),
    "Work Type": select(row.workType),
    Intent: select(row.intent),
    Category: select(row.category),
    "Task Complexity": select(row.taskComplexity),
    "Prompt Specificity": select(row.promptSpecificity),
    "Prompt Hash": richText(row.promptHash),
    "Prompt Excerpt": richText(row.promptExcerpt),
    "Captured At": dateProp(row.capturedAt),
    CWD: richText(row.cwd),
    Project: richText(row.project),
    "Session ID": richText(row.sessionId),
    "Prompt Model": richText(row.promptModel),
    "Transcript Path": richText(row.transcriptPath),
    Tags: multiSelect(row.notionTags),
    "Skills Used": multiSelect(row.skillsUsed),
    "Skill Count": { number: row.skillCount },
    "Skill Evidence": richText(row.skillEvidence),
    Source: select(row.source),
    "Classifier Model": richText(row.classifierModel),
  }
}

function notionPatchProperties(row: Partial<InsightRow>): Record<string, any> {
  const properties: Record<string, any> = {}
  if (row.notionTags !== undefined) properties.Tags = multiSelect(row.notionTags)
  if (row.skillsUsed !== undefined) properties["Skills Used"] = multiSelect(row.skillsUsed)
  if (row.skillCount !== undefined) properties["Skill Count"] = { number: row.skillCount }
  if (row.skillEvidence !== undefined) properties["Skill Evidence"] = richText(row.skillEvidence)
  if (row.transcriptPath !== undefined) properties["Transcript Path"] = richText(row.transcriptPath)
  if (row.sessionId !== undefined) properties["Session ID"] = richText(row.sessionId)
  if (row.cwd !== undefined) properties.CWD = richText(row.cwd)
  if (row.project !== undefined) properties.Project = richText(row.project)
  if (row.promptModel !== undefined) properties["Prompt Model"] = richText(row.promptModel)
  return properties
}

function title(value: string): Record<string, unknown> {
  return { title: [{ text: { content: truncate(value, 2000) } }] }
}

function richText(value = ""): Record<string, unknown> {
  const content = truncate(value, 2000)
  return content ? { rich_text: [{ text: { content } }] } : { rich_text: [] }
}

function select(value = ""): Record<string, unknown> {
  return value ? { select: { name: value } } : { select: null }
}

function multiSelect(values: ReadonlyArray<string> = []): Record<string, unknown> {
  return { multi_select: values.map((name) => ({ name })) }
}

function dateProp(value = ""): Record<string, unknown> {
  return value ? { date: { start: value } } : { date: null }
}

async function pace(config: AppConfig): Promise<void> {
  const elapsed = Date.now() - lastNotionRequestAt
  if (elapsed < config.notionMinRequestIntervalMs) {
    await sleep(config.notionMinRequestIntervalMs - elapsed)
  }
  lastNotionRequestAt = Date.now()
}

function shouldRetry(error: unknown): boolean {
  const status = errorStatus(error)
  return status === 429 || status === 502 || status === 503 || status === 504
}

function retryDelayMs(error: unknown, attempt: number): number {
  const retryAfter = Number.parseFloat(
    String((error as { headers?: Record<string, string> }).headers?.["retry-after"] || ""),
  )
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.ceil(retryAfter * 1000)
  return Math.min(60_000, 1000 * 2 ** attempt)
}

function errorStatus(error: unknown): number | undefined {
  if (error instanceof APIResponseError) return error.status
  if (typeof error === "object" && error !== null && "status" in error) {
    return Number((error as { status: unknown }).status)
  }
  return undefined
}
