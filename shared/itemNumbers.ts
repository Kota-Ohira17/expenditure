/**
 * 複数の項目番号を短く書く。末尾の番号だけが連続しているものを「~」でまとめる。
 * 例: out01-04-01, out01-04-02, out01-04-03, out01-05-01 → 「out01-04-01~03, out01-05-01」
 * 並びは番号順にそろえ、重複は1つにする。
 */
export function formatItemNumbers(numbers: string[]) {
  const unique = [...new Set(numbers.map(n => n.trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'ja', { numeric: true }))

  const parts: string[] = []
  let run: { prefix: string, first: string, last: string, lastNo: number } | null = null
  const flush = () => {
    if (run) parts.push(run.first === run.last ? `${run.prefix}${run.first}` : `${run.prefix}${run.first}~${run.last}`)
    run = null
  }

  for (const n of unique) {
    // 「~」を含む（すでにまとめてある）ものはそのまま
    const m = n.includes('~') ? null : /^(.*?)(\d+)$/.exec(n)
    if (!m) {
      flush()
      parts.push(n)
      continue
    }
    const [, prefix, digits] = m as unknown as [string, string, string]
    const no = Number(digits)
    // 前と同じ接頭部で、番号が1つ次（桁数も同じ）なら続ける
    if (run && run.prefix === prefix && no === run.lastNo + 1 && digits.length === run.last.length) {
      run.last = digits
      run.lastNo = no
      continue
    }
    flush()
    run = { prefix, first: digits, last: digits, lastNo: no }
  }
  flush()
  return parts.join(', ')
}

/** 保存済みの「a, b, c」形式の項目番号を短く書き直す（前からある申請の表示用） */
export const shortenItemNumbers = (value: string) => (value.includes(',') ? formatItemNumbers(value.split(',')) : value)
