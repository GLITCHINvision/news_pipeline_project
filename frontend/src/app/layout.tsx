import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'NewsPulse — Topic-Clustered News Timeline',
  description: 'Live news aggregation with TF-IDF topic clustering across BBC News, NPR, and Al Jazeera. Visualise breaking topics as they evolve across time.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
