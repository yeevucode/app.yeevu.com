import { Suspense } from 'react';
import CheckerWidget from './checker-widget';

interface Props {
  icon: string;
  title: string;
  description: string;
  check: string;
  whatChecks: string[];
}

export default function CheckerPageLayout({ icon, title, description, check, whatChecks }: Props) {
  return (
    <div className="checker-page-dark">
      <div className="checker-page-content">
        <div className="checker-page-hero">
          <span className="checker-page-icon">{icon}</span>
          <h1 className="checker-page-title">{title}</h1>
          <p className="checker-page-desc">{description}</p>
        </div>

        <div className="checker-page-widget">
          <Suspense>
            <CheckerWidget check={check} />
          </Suspense>
        </div>

        <div className="checker-page-info">
          <h2>What does this check?</h2>
          <ul>
            {whatChecks.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
