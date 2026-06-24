/** Insert `snippet` over the [selStart, selEnd) range, returning the new text
 *  and the caret position just after the inserted snippet. Pure (no DOM). */
export function insertAtCursor(
  text: string,
  selStart: number,
  selEnd: number,
  snippet: string,
): { text: string; cursor: number } {
  const before = text.slice(0, selStart)
  const after = text.slice(selEnd)
  return { text: `${before}${snippet}${after}`, cursor: selStart + snippet.length }
}

/** Replace the first occurrence of `token` with `replacement`. Returns the text
 *  unchanged if the token is absent. */
export function replaceFirst(text: string, token: string, replacement: string): string {
  const i = text.indexOf(token)
  if (i === -1) return text
  return text.slice(0, i) + replacement + text.slice(i + token.length)
}
