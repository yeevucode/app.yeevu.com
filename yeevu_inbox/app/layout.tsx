import type { Metadata } from 'next';
import Link from 'next/link';
import { getSession } from '@auth0/nextjs-auth0';
import './globals.css';

export const metadata: Metadata = {
  title: 'YeevuInbox - Email Deliverability Checker',
  description: 'Check your domain\'s SPF, DKIM, and DMARC configuration to ensure your emails land in the inbox.',
};

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  const user = session?.user;

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;600;700&family=Inter:wght@300;400;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="app-container">
          <header className="header">
            <a href="/" className="logo">Yeevu AI</a>
            <nav className="nav">
              <Link href="/" className="active">Email Deliverability</Link>
              <a href="/dns-email-resolver/">DNS Resolver</a>
              <a href="https://ai.yeevu.com" target="_blank" rel="noopener noreferrer">Create Apps & Websites</a>
              <a href="/content-creator/">Content Creator</a>
              <a href="/web-prompter/">Web Prompter</a>
              <a href="/account/">Account</a>
            </nav>
            <div className="nav-auth">
              {user ? (
                <>
                  <Link href="/dashboard" style={{ color: 'var(--brand-yellow)', fontWeight: 500, marginRight: '0.5rem' }}>My Projects</Link>
                  <span className="nav-user">{user.name || user.email}</span>
                  <a className="nav-auth-link" href={`${basePath}/api/auth/logout`}>Sign out</a>
                </>
              ) : (
                <a className="nav-auth-link" href={`${basePath}/api/auth/login`}>Sign in</a>
              )}
            </div>
          </header>
          <main className="main">{children}</main>
          <footer className="footer">
            <p>&copy; {new Date().getFullYear()} <a href="https://yeevu.com">Yeevu AI</a></p>
          </footer>
        </div>
      </body>
    </html>
  );
}
