import { Fragment, type ReactNode } from "react"

/**
 * An assistant answer as text: paragraphs, "- " bullets and **bold**, the
 * only formatting the prompt allows. Everything else, HTML and markdown
 * links included, shows as the characters it is, so model output can't add
 * markup, images or links to the page (#210).
 */
export function AssistantText({ text }: { text: string }) {
  const blocks = toBlocks(text)
  return (
    <div className="min-w-0 space-y-2 break-words text-body text-foreground [overflow-wrap:anywhere]">
      {blocks.map((b, i) =>
        b.type === "list" ? (
          <ul key={i} className="list-disc space-y-1 pl-5">
            {b.items.map((item, j) => (
              <li key={j}>{inline(item)}</li>
            ))}
          </ul>
        ) : (
          <p key={i} className="whitespace-pre-line">
            {inline(b.text)}
          </p>
        ),
      )}
    </div>
  )
}

type Block = { type: "p"; text: string } | { type: "list"; items: string[] }

function toBlocks(text: string): Block[] {
  const blocks: Block[] = []
  for (const para of text.replace(/\r\n?/g, "\n").split(/\n{2,}/)) {
    const lines = para.split("\n").filter((l) => l.trim())
    if (lines.length === 0) continue
    let run: string[] = []
    const flush = () => {
      if (run.length) blocks.push({ type: "p", text: run.join("\n") })
      run = []
    }
    for (const line of lines) {
      const bullet = /^\s*[-•*]\s+(.*)$/.exec(line)
      if (!bullet) {
        run.push(line)
        continue
      }
      flush()
      const last = blocks[blocks.length - 1]
      if (last?.type === "list") last.items.push(bullet[1])
      else blocks.push({ type: "list", items: [bullet[1]] })
    }
    flush()
  }
  return blocks
}

/** `**bold**` spans; the rest as plain text (React escapes it). */
function inline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*\n]+\*\*)/g)
  return parts.map((part, i) =>
    /^\*\*[^*\n]+\*\*$/.test(part) ? (
      <strong key={i} className="font-semibold">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  )
}
