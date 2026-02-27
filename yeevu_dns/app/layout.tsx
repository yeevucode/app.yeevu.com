import './globals.css'
import { getSession } from '@auth0/nextjs-auth0'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''

export const metadata = { title: 'YeevuDNS', description: 'DNS management made simple' }

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  const user = session?.user

  return (
    <html lang="en">
      <body>
        <nav style={{
          background: '#1e293b',
          borderBottom: '1px solid #334155',
          padding: '0 24px',
          height: 56,
          display: 'flex',
          alignItems: 'center',
          gap: 24,
        }}>
          <a href={`${BASE}/`} style={{ fontWeight: 700, fontSize: 16, color: '#38bdf8' }}>
            YeevuDNS
          </a>
          <div style={{ flex: 1 }} />
          {user ? (
            <>
              <a href={`${BASE}/dashboard`} style={{ color: '#94a3b8', fontSize: 14 }}>Dashboard</a>
              <a href={`${BASE}/api/auth/logout`} style={{ color: '#94a3b8', fontSize: 14 }}>Sign out</a>
            </>
          ) : (
            <a
              href={`${BASE}/api/auth/login`}
              style={{
                background: '#38bdf8',
                color: '#0f172a',
                padding: '6px 16px',
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              Sign in
            </a>
          )}
        </nav>
        <main>{children}</main>
      </body>
    </html>
  )
}
