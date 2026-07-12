/**
 * Section partition for the /articles index page.
 *
 * The "All" tab is the site's only full archive: the grid must show every
 * published article except the featured lead (which has its own hero slot).
 * The rail ("Recent Articles") is a condensed duplicate of the next three —
 * that overlap is intentional editorial navigation; re-rendering the featured
 * lead inside the grid is not, and hiding everything older than the rail
 * (the pre-fix `slice(0, 3)`) silently buried the archive.
 */
export function selectArticleIndexSections<T>(all: T[], topicFiltered: T[] | null) {
  const featuredLead = all[0] ?? null
  const latest = all.slice(1, 4)
  // The hero always renders featuredLead, so the grid never repeats it — on the
  // All tab (full archive) and on topic tabs (where the filter may include it) alike.
  const feedArticles = (topicFiltered ?? all).filter((article) => article !== featuredLead)
  return { featuredLead, latest, feedArticles }
}
