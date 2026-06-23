// src/types/index.ts
export interface Article {
  id: string;
  title: string;
  summary: string | null;
  body: string | null;
  url: string;
  source: string;
  published_at: string;
}

export interface Cluster {
  id: number;
  label: string;
  articleCount: number;
  earliestArticle?: string;
  latestArticle?: string;
  startTime?: string;
  endTime?: string;
  sources: string[];
  size?: number;
}

export interface ClusterDetail extends Cluster {
  articles: Article[];
}

export interface DbStats {
  status: string;
  database: { articles: number; clusters: number };
}

export type Theme = 'light' | 'dark';

export type Category =
  | 'All'
  | 'World'
  | 'Politics'
  | 'Business'
  | 'Technology'
  | 'Science'
  | 'Sports'
  | 'Health'
  | 'Entertainment';
