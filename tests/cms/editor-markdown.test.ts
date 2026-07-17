import { describe, it, expect } from "vitest"
import { editorDomToMarkdown, markdownToEditorHtml } from "@/lib/cms/editor-markdown"

// Build a <ul>/<ol> whose items are the given strings and attach it as a *child*
// of a wrapper element via the DOM API. This faithfully reproduces the live tree
// contentEditable's execCommand produces: setting innerHTML="<p><ul>...</ul></p>"
// would let the HTML parser foster-parent the <ul> out of the <p>, but
// execCommand mutates nodes directly and genuinely nests the list inside the <p>.
function listInside(wrapperTag: string, listTag: "ul" | "ol", items: string[]): HTMLElement {
  const wrapper = document.createElement(wrapperTag)
  const list = document.createElement(listTag)
  for (const text of items) {
    const li = document.createElement("li")
    li.textContent = text
    list.appendChild(li)
  }
  wrapper.appendChild(list)
  return wrapper
}

function root(...children: (Node | string)[]): HTMLElement {
  const el = document.createElement("div")
  for (const child of children) {
    el.appendChild(typeof child === "string" ? document.createTextNode(child) : child)
  }
  return el
}

describe("editorDomToMarkdown -- list line breaks (regression)", () => {
  // The bug: Chromium's execCommand("insertUnorderedList") over a multi-paragraph
  // selection nests the new <ul> inside a <p>. The old serializer only recognised
  // top-level lists, so a wrapped list collapsed to run-on text -- the four lists
  // in the july-2-failed-incident draft became continuous paragraphs
  // ("...halted previously.Performed root cause analysis...").
  it("preserves \\n between items of a <ul> the browser nested inside a <p>", () => {
    const p1 = document.createElement("p")
    p1.textContent = "Intro paragraph"
    const wrappedList = listInside("p", "ul", ["halted previously", "Performed root cause analysis"])
    const dom = root(p1, wrappedList)

    const md = editorDomToMarkdown(dom)

    expect(md).toBe("Intro paragraph\n\n- halted previously\n- Performed root cause analysis")
    // The exact prod symptom must never reappear: items glued with no separator.
    expect(md).not.toContain("previouslyPerformed")
    expect(md).toContain("- halted previously\n- Performed root cause analysis")
  })

  it("preserves numbering of an <ol> the browser nested inside a <div>", () => {
    const wrappedList = listInside("div", "ol", ["First step", "Second step"])
    const dom = root(wrappedList)

    const md = editorDomToMarkdown(dom)

    expect(md).toBe("1. First step\n2. Second step")
  })

  it("still serializes a clean top-level <ul> correctly (no regression)", () => {
    const list = document.createElement("ul")
    for (const text of ["one", "two", "three"]) {
      const li = document.createElement("li")
      li.textContent = text
      list.appendChild(li)
    }
    const dom = root(list)

    expect(editorDomToMarkdown(dom)).toBe("- one\n- two\n- three")
  })

  it("keeps inline formatting inside a wrapped list item", () => {
    const wrapper = document.createElement("p")
    const list = document.createElement("ul")
    const li = document.createElement("li")
    const strong = document.createElement("strong")
    strong.textContent = "bold"
    li.append(document.createTextNode("has "), strong)
    list.appendChild(li)
    wrapper.appendChild(list)
    const dom = root(wrapper)

    expect(editorDomToMarkdown(dom)).toBe("- has **bold**")
  })

  it("does not treat an ordinary paragraph as a container", () => {
    const p = document.createElement("p")
    const strong = document.createElement("strong")
    strong.textContent = "world"
    p.append(document.createTextNode("hello "), strong)
    const dom = root(p)

    expect(editorDomToMarkdown(dom)).toBe("hello **world**")
  })
})

describe("editorDomToMarkdown -- markdown list round-trip", () => {
  // Load stored markdown into editor HTML, then serialize it straight back. This
  // is what happens when an existing article with lists is opened and re-saved.
  it("round-trips a bullet list through markdownToEditorHtml unchanged", () => {
    const source = "Lead in.\n\n- first item\n- second item\n- third item"
    const el = document.createElement("div")
    el.innerHTML = markdownToEditorHtml(source)

    expect(editorDomToMarkdown(el)).toBe(source)
  })

  it("round-trips a numbered list through markdownToEditorHtml unchanged", () => {
    const source = "1. alpha\n2. beta\n3. gamma"
    const el = document.createElement("div")
    el.innerHTML = markdownToEditorHtml(source)

    expect(editorDomToMarkdown(el)).toBe(source)
  })
})
