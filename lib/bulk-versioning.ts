// Bulk Versioning: match local files to existing records by file name so the
// local file can be added as a new version of the record's master file.

export interface VersionTarget {
  recordId: string
  title: string
  fileName: string
  fileId: string | null
  fileSize: number | null
  versionNumber: number | null
  modifiedOn: string | null
  thumbnailUrl: string | null
}

export interface Candidate {
  target: VersionTarget
  score: number
  reason: string
}

export function stripExtension(name: string): string {
  const i = name.lastIndexOf(".")
  return i > 0 ? name.slice(0, i) : name
}

export function extensionOf(name: string): string {
  const i = name.lastIndexOf(".")
  return i > 0 ? name.slice(i + 1).toLowerCase() : ""
}

/**
 * Normalises a file name for comparison: lower-case, no extension, separators
 * collapsed, and common revision markers removed (v2, _final, (1), copy…).
 */
export function normalizeName(name: string): string {
  let s = stripExtension(name).toLowerCase()
  s = s.replace(/[\s_\-.]+/g, " ").trim()
  // Trailing revision markers, possibly repeated: "banner v2 final (1)"
  const marker = /\s*(\(\d+\)|v\d+[a-z]?|ver(sion)?\s*\d+|rev\s*\d+|r\d+|final|draft|copy|new|old|latest|updated|edit(ed)?|\d{4}[-\s]?\d{2}[-\s]?\d{2})$/
  let prev = ""
  while (prev !== s) {
    prev = s
    s = s.replace(marker, "").trim()
  }
  return s.replace(/\s+/g, " ")
}

function bigrams(s: string): Set<string> {
  const t = s.replace(/\s+/g, "")
  const out = new Set<string>()
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2))
  return out
}

/** Sørensen–Dice similarity of two strings, 0..1. */
export function dice(a: string, b: string): number {
  const A = bigrams(a)
  const B = bigrams(b)
  if (!A.size || !B.size) return a === b ? 1 : 0
  let hits = 0
  for (const g of A) if (B.has(g)) hits++
  return (2 * hits) / (A.size + B.size)
}

/** Scores how likely a record's master file is the earlier version of a local file. 0..100. */
export function scoreMatch(localName: string, target: VersionTarget): { score: number; reason: string } {
  const remote = target.fileName || ""
  if (!remote) return { score: 0, reason: "no file" }
  if (remote.toLowerCase() === localName.toLowerCase()) return { score: 100, reason: "same file name" }
  const lStem = stripExtension(localName).toLowerCase()
  const rStem = stripExtension(remote).toLowerCase()
  const sameExt = extensionOf(localName) === extensionOf(remote)
  if (lStem === rStem) return { score: sameExt ? 96 : 90, reason: sameExt ? "same name" : "same name, different type" }
  const lNorm = normalizeName(localName)
  const rNorm = normalizeName(remote)
  if (lNorm && lNorm === rNorm) return { score: sameExt ? 88 : 80, reason: "same name ignoring revision markers" }
  if (lNorm && rNorm && lNorm.length >= 4 && rNorm.length >= 4 && (lNorm.includes(rNorm) || rNorm.includes(lNorm))) {
    return { score: sameExt ? 70 : 62, reason: "one name contains the other" }
  }
  const d = dice(lNorm, rNorm)
  if (d >= 0.6) return { score: Math.round(30 + d * 40), reason: `${Math.round(d * 100)}% similar` }
  return { score: 0, reason: "" }
}

/** Ranked candidates for a local file; only meaningful scores are kept. */
export function candidatesFor(localName: string, targets: VersionTarget[], limit = 6): Candidate[] {
  const out: Candidate[] = []
  for (const target of targets) {
    const { score, reason } = scoreMatch(localName, target)
    if (score > 0) out.push({ target, score, reason })
  }
  return out.sort((a, b) => b.score - a.score || a.target.fileName.localeCompare(b.target.fileName)).slice(0, limit)
}

/** Above this score a match is selected automatically; below it the user must confirm. */
export const AUTO_MATCH_SCORE = 80

export function formatBytes(n: number | null | undefined): string {
  if (n == null) return "–"
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
