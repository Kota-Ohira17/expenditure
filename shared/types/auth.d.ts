import type { Role } from '../roles'

declare module '#auth-utils' {
  interface User {
    email: string
    name: string
    role: Role
  }
  interface UserSession {
    loggedInAt: number
  }
  /** サーバーだけが読めるセッションの中身 */
  interface SecureSessionData {
    /** 決算シートをスプレッドシートに書き出すための、本人の Google アカウントのアクセストークン */
    googleSheets?: { accessToken: string, expiresAt: number }
  }
}

export {}
