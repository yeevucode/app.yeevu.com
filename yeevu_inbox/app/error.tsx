'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="error">
      <div className="error-icon" style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
      <h2 style={{ fontSize: '1.5rem', color: 'var(--gray-900)', marginBottom: '0.5rem' }}>Something went wrong</h2>
      <p style={{ color: 'var(--gray-600)', marginBottom: '1.5rem' }}>
        {error.message || 'An unexpected error occurred'}
      </p>
      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
        <button onClick={reset} className="search-button">
          Try again
        </button>
        <Link href="/" className="back-link">
          ← Go Home
        </Link>
      </div>
    </div>
  );
}
