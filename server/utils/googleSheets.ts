import { createSign } from 'node:crypto'
import type { Table } from './settlement'

/**
 * Google スプレッドシートへの書き出し（サービスアカウントで認証）。
 * 書き出し先のスプレッドシートは、サービスアカウントのメールアドレスと「編集者」として共有しておく必要がある。
 * 環境変数: NUXT_GOOGLE_SERVICE_ACCOUNT_EMAIL / NUXT_GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
 */

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets'

export function serviceAccount() {
  const { googleServiceAccountEmail: email, googleServiceAccountPrivateKey: key } = useRuntimeConfig()
  // 環境変数では改行が \n と書かれていることが多いので戻す
  return email && key ? { email, privateKey: key.replace(/\\n/g, '\n') } : null
}

/** URL（…/spreadsheets/d/<ID>/edit…）か ID そのものから ID を取り出す */
export function spreadsheetIdOf(input: string) {
  const m = input.match(/\/spreadsheets\/d\/([\w-]+)/)
  if (m) return m[1]!
  return /^[\w-]{20,}$/.test(input.trim()) ? input.trim() : null
}

async function accessToken() {
  const sa = serviceAccount()
  if (!sa) throw createError({ statusCode: 500, message: 'スプレッドシート出力用のサービスアカウントが設定されていません（README の「決算シートをスプレッドシートに出力」参照）。' })
  const now = Math.floor(Date.now() / 1000)
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const unsigned = `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc({
    iss: sa.email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`
  let signature: string
  try {
    signature = createSign('RSA-SHA256').update(unsigned).sign(sa.privateKey, 'base64url')
  }
  catch {
    throw createError({ statusCode: 500, message: 'サービスアカウントの秘密鍵（NUXT_GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY）が読み取れません。' })
  }
  const res = await $fetch<{ access_token: string }>('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
  }).catch(() => {
    throw createError({ statusCode: 500, message: 'Google の認証に失敗しました。サービスアカウントの設定を確認してください。' })
  })
  return res.access_token
}

/** Sheets API を呼ぶ。権限・存在のエラーは分かる日本語にする */
async function sheetsApi<T>(token: string, path: string, init: { method?: 'GET' | 'POST' | 'PUT', body?: unknown, query?: Record<string, string> } = {}) {
  try {
    return await $fetch<T>(`${SHEETS_API}/${path}`, {
      method: init.method ?? 'GET',
      body: init.body as Record<string, unknown> | undefined,
      query: init.query,
      headers: { Authorization: `Bearer ${token}` },
    })
  }
  catch (error) {
    const status = (error as { statusCode?: number }).statusCode
    const email = serviceAccount()?.email
    if (status === 403 || status === 404) {
      throw createError({
        statusCode: 400,
        message: `スプレッドシートを開けませんでした。URL が正しいか、スプレッドシートを ${email} と「編集者」として共有しているか確認してください。`,
      })
    }
    throw createError({ statusCode: 502, message: 'スプレッドシートへの書き込みに失敗しました。時間をおいてもう一度試してください。' })
  }
}

const NUMBER_FORMAT = {
  yen: { type: 'NUMBER', pattern: '#,##0;[Red]-#,##0' },
  rate: { type: 'PERCENT', pattern: '0.0%' },
  date: { type: 'DATE', pattern: 'yyyy/mm/dd' },
} as const

const rgb = (hex: string) => ({
  red: Number.parseInt(hex.slice(0, 2), 16) / 255,
  green: Number.parseInt(hex.slice(2, 4), 16) / 255,
  blue: Number.parseInt(hex.slice(4, 6), 16) / 255,
})

/** セルの値。リンクは HYPERLINK 関数、文字は数式として解釈されないよう先頭の = + - @ を無効化する */
function cellValue(v: Table['rows'][number]['values'][string] | undefined): string | number {
  if (v == null) return ''
  if (typeof v === 'number') return v
  if (v instanceof Date) return v.toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' }).replaceAll('-', '/')
  if (typeof v === 'object') return `=HYPERLINK("${v.url.replaceAll('"', '""')}","${v.text.replaceAll('"', '""')}")`
  return /^[=+\-@]/.test(v) ? `'${v}` : v
}

/**
 * 表をスプレッドシートに書き出す。同じ名前のシートがあれば中身を消して書き直し、なければ追加する。
 * dryRun のときは Google に送らず、送る予定の内容の概要を返す。
 */
export async function writeTablesToSpreadsheet(spreadsheetId: string, tables: Table[], { dryRun = false } = {}) {
  const plan = tables.map(t => ({
    name: t.name,
    values: [t.columns.map(c => c.header), ...t.rows.map(r => t.columns.map(c => cellValue(r.values[c.key])))],
  }))
  if (dryRun) {
    return { dryRun: true, sheets: plan.map(p => ({ name: p.name, rows: p.values.length, columns: p.values[0]!.length, sample: p.values.slice(0, 3) })) }
  }

  const token = await accessToken()
  const meta = await sheetsApi<{ sheets: { properties: { sheetId: number, title: string } }[] }>(
    token, spreadsheetId, { query: { fields: 'sheets.properties(sheetId,title)' } },
  )
  const sheetIds = new Map(meta.sheets.map(s => [s.properties.title, s.properties.sheetId]))

  // 足りないシートを追加
  const missing = tables.filter(t => !sheetIds.has(t.name))
  if (missing.length) {
    const added = await sheetsApi<{ replies: { addSheet: { properties: { sheetId: number, title: string } } }[] }>(
      token, `${spreadsheetId}:batchUpdate`,
      { method: 'POST', body: { requests: missing.map(t => ({ addSheet: { properties: { title: t.name } } })) } },
    )
    for (const r of added.replies) sheetIds.set(r.addSheet.properties.title, r.addSheet.properties.sheetId)
  }

  // 中身と書式を消して、行数・列数をそろえる
  await sheetsApi(token, `${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    body: {
      requests: tables.flatMap((t, i) => {
        const sheetId = sheetIds.get(t.name)!
        return [
          { updateCells: { range: { sheetId }, fields: 'userEnteredValue,userEnteredFormat' } },
          {
            updateSheetProperties: {
              properties: { sheetId, gridProperties: { rowCount: plan[i]!.values.length + 5, columnCount: t.columns.length, frozenRowCount: 1 } },
              fields: 'gridProperties(rowCount,columnCount,frozenRowCount)',
            },
          },
        ]
      }),
    },
  })

  // 値を書き込む（HYPERLINK 関数や日付を解釈させるため USER_ENTERED）
  await sheetsApi(token, `${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    body: {
      valueInputOption: 'USER_ENTERED',
      data: plan.map(p => ({ range: `'${p.name}'!A1`, values: p.values })),
    },
  })

  // 書式（見出し・数値の形式・階層の色・総計の線・列幅・フィルタ）
  const requests: object[] = []
  for (const t of tables) {
    const sheetId = sheetIds.get(t.name)!
    const rowCount = t.rows.length + 1
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
        cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: rgb(HEADER_FILL) } },
        fields: 'userEnteredFormat(textFormat,backgroundColor)',
      },
    })
    t.columns.forEach((c, ci) => {
      if (c.format) {
        requests.push({
          repeatCell: {
            range: { sheetId, startRowIndex: 1, endRowIndex: rowCount, startColumnIndex: ci, endColumnIndex: ci + 1 },
            cell: { userEnteredFormat: { numberFormat: NUMBER_FORMAT[c.format] } },
            fields: 'userEnteredFormat.numberFormat',
          },
        })
      }
      requests.push({
        updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: ci, endIndex: ci + 1 },
          properties: { pixelSize: Math.round(c.width * 7.5) },
          fields: 'pixelSize',
        },
      })
    })
    t.rows.forEach((r, ri) => {
      const range = { sheetId, startRowIndex: ri + 1, endRowIndex: ri + 2 }
      if (r.bold) {
        requests.push({
          repeatCell: { range, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: 'userEnteredFormat.textFormat.bold' },
        })
      }
      if (r.fill) {
        // シートと同じく、塗り始める列から右だけを塗る
        const from = Math.max(r.fillFrom ? t.columns.findIndex(c => c.key === r.fillFrom) : 0, 0)
        requests.push({
          repeatCell: {
            range: { ...range, startColumnIndex: from, endColumnIndex: t.columns.length },
            cell: { userEnteredFormat: { backgroundColor: rgb(r.fill) } },
            fields: 'userEnteredFormat.backgroundColor',
          },
        })
      }
      if (r.topBorder) requests.push({ updateBorders: { range, top: { style: 'DOUBLE' } } })
    })
    requests.push({ setBasicFilter: { filter: { range: { sheetId, startRowIndex: 0, endRowIndex: rowCount, startColumnIndex: 0, endColumnIndex: t.columns.length } } } })
  }
  await sheetsApi(token, `${spreadsheetId}:batchUpdate`, { method: 'POST', body: { requests } })

  return {
    url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    sheets: plan.map(p => ({ name: p.name, rows: p.values.length - 1 })),
  }
}
