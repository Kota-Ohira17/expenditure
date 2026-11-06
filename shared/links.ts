/** http・https のリンク（空白で区切る。全角の空白も区切りとみなす） */
const LINK = /https?:\/\/[^\s\u3000]+/g

/** 文の中のリンクを順に取り出す（同じリンクは1つにまとめる）。商品名とリンクを続けて書いてあっても拾う */
export function extractLinks(text: string) {
  return [...new Set(text.match(LINK) ?? [])]
}

/** 文をリンクとそれ以外に分ける（画面でリンクの部分だけ開けるようにする） */
export function splitByLinks(text: string) {
  const parts: { text: string, isLink: boolean }[] = []
  let at = 0
  for (const m of text.matchAll(LINK)) {
    if (m.index > at) parts.push({ text: text.slice(at, m.index), isLink: false })
    parts.push({ text: m[0], isLink: true })
    at = m.index + m[0].length
  }
  if (at < text.length) parts.push({ text: text.slice(at), isLink: false })
  return parts
}
