#!/usr/bin/env bash
# extract-text.sh <file> [max_chars] — dump a document's text to stdout for
# classification. Handles pdf / docx / xlsx / pptx / md / txt / csv / json / rtf.
# Best-effort and capped; on anything it can't parse it prints the filename so
# the classifier can still fall back to name-based judgement. Never fails hard.
set -o pipefail
f="$1"; max="${2:-8000}"
[ -f "$f" ] || { echo "(missing file: $f)"; exit 0; }
ext="$(printf '%s' "${f##*.}" | tr 'A-Z' 'a-z')"
strip_xml() { sed -e 's/<[^>]*>/ /g' -e 's/&amp;/\&/g;s/&lt;/</g;s/&gt;/>/g;s/&#39;/'"'"'/g;s/&quot;/"/g' | tr -s '[:space:]' ' '; }

case "$ext" in
  pdf)
    pdftotext -l 6 -q "$f" - 2>/dev/null ;;
  docx)
    unzip -p "$f" word/document.xml 2>/dev/null | strip_xml ;;
  xlsx)
    { unzip -p "$f" xl/sharedStrings.xml 2>/dev/null | strip_xml; \
      unzip -p "$f" xl/worksheets/sheet1.xml 2>/dev/null | strip_xml; } ;;
  pptx)
    unzip -p "$f" 'ppt/slides/slide*.xml' 2>/dev/null | strip_xml ;;
  md|txt|csv|json|rtf|html|htm)
    cat "$f" 2>/dev/null ;;
  doc)
    # legacy .doc: grab printable strings as a last resort
    tr -cd '[:print:]\n' < "$f" 2>/dev/null ;;
  *)
    echo "(no text extractor for .$ext)" ;;
esac | head -c "$max"
echo
