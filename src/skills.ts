import type { TranscriptSkill } from "./types.js"
import { compactEvidence } from "./utils.js"

export function detectSkills(text: string): ReadonlyArray<TranscriptSkill> {
  const skills = new Map<string, TranscriptSkill>()
  for (const item of announcedSkills(text)) skills.set(item.key, item)
  for (const item of skillFileReads(text))
    skills.set(item.key, mergeSkill(skills.get(item.key), item))
  return [...skills.values()].sort((left, right) => left.key.localeCompare(right.key))
}

function announcedSkills(text: string): ReadonlyArray<TranscriptSkill> {
  const found: TranscriptSkill[] = []
  const patterns = [
    /\bUsing(?: the)? [`'"]?([A-Za-z0-9:_-]+)[`'"]? skill\b/giu,
    /\bI(?:'ll| will|’ll)? (?:use|load|follow)(?: the)? [`'"]?([A-Za-z0-9:_-]+)[`'"]? skill\b/giu,
    /\bI(?:'m| am|’m) using(?: the)? [`'"]?([A-Za-z0-9:_-]+)[`'"]? skill\b/giu,
  ]
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const key = normalizeSkillKey(match[1])
      if (!key) continue
      found.push({
        key,
        name: key,
        detectionMethod: "announcement",
        evidence: compactEvidence(match[0]),
      })
    }
  }
  return found
}

function skillFileReads(text: string): ReadonlyArray<TranscriptSkill> {
  const found: TranscriptSkill[] = []
  for (const match of text.matchAll(/\/(?:[^"'\s]+\/)*([A-Za-z0-9:_-]+)\/SKILL\.md/gu)) {
    const key = normalizeSkillKey(match[1])
    if (!key) continue
    found.push({
      key,
      name: key,
      detectionMethod: "skill-file-read",
      evidence: compactEvidence(match[0]),
    })
  }
  return found
}

function mergeSkill(existing: TranscriptSkill | undefined, next: TranscriptSkill): TranscriptSkill {
  if (!existing) return next
  const methods = [...new Set([...existing.detectionMethod.split("+"), next.detectionMethod])].join(
    "+",
  )
  const evidence = [...new Set([existing.evidence, next.evidence].filter(Boolean))].join(" | ")
  return { ...existing, detectionMethod: methods, evidence }
}

function normalizeSkillKey(value: string | undefined): string {
  return (value || "").trim().replace(/[.,;:]+$/u, "")
}
