import fs from "node:fs"

export function readEnvFile(filePath: string): Record<string, string> {
  if (!filePath || !fs.existsSync(filePath)) return {}
  const result: Record<string, string> = {}
  const text = fs.readFileSync(filePath, "utf8")
  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue
    const equalsIndex = line.indexOf("=")
    if (equalsIndex < 0) continue
    const key = line.slice(0, equalsIndex).trim()
    const value = unquoteEnvValue(line.slice(equalsIndex + 1).trim())
    if (key) result[key] = value
  }
  return result
}

function unquoteEnvValue(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  return value
}
