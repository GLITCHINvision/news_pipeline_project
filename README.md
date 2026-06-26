# 📰 NewsPulse — Real-Time Topic-Clustered News Timeline

> A full-stack news aggregation platform that automatically groups breaking stories from multiple sources into topic clusters and visualises them on an interactive timeline.

![NewsPulse](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)
![Express](https://img.shields.io/badge/Express-4-green?style=flat-square&logo=express)
![Python](https://img.shields.io/badge/Python-3.x-blue?style=flat-square&logo=python)
![SQLite](https://img.shields.io/badge/SQLite-3-lightblue?style=flat-square&logo=sqlite)
![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

---

## 🌟 What I Built

NewsPulse is a **news intelligence dashboard** that:

1. **Fetches** live RSS feeds from BBC News, NPR, and Al Jazeera every time you hit "Refresh Feeds"
2. **Scrapes** the full article text from each URL using BeautifulSoup
3. **Clusters** articles by topic using TF-IDF vectorisation + cosine similarity (no LLM needed — pure ML)
4. **Stores** everything in a local SQLite database
5. **Visualises** the clusters as a Gantt-style timeline — the longer/taller the bar, the more coverage a story got

The key idea: instead of showing you a raw list of headlines, you can **see at a glance which stories are trending** across multiple news sources simultaneously.

---

## 🧠 How I Built It

### The Problem
Most news aggregators show you a flat chronological list. I wanted to answer: *"What are the biggest stories right now, across all sources, and how have they evolved over time?"*

### The Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                               │
│            Next.js Frontend (port 3000)                      │
│   Timeline UI ← fetch → REST API                            │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP
┌────────────────────────▼────────────────────────────────────┐
│              Node.js / Express Backend (port 5000)           │
│  GET /api/timeline   GET /api/clusters/:id                   │
│  POST /api/ingest/trigger ──► spawn Python subprocess        │
└──────────┬──────────────────────────┬───────────────────────┘
           │                          │
    ┌──────▼──────┐         ┌─────────▼──────────┐
    │  SQLite DB  │         │   ingest.py         │
    │  articles   │◄────────│  1. Fetch RSS feeds  │
    │  clusters   │         │  2. Scrape full text │
    │  ingest_jobs│         │  3. TF-IDF + cosine  │
    └─────────────┘         │  4. Write to SQLite  │
                            └────────────────────--┘
```

### Why These Choices?

| Decision | Why |
|---|---|
| **SQLite** over PostgreSQL | Zero-config, file-based, perfect for a self-contained demo. All data lives in `backend/db.sqlite`. |
| **Python subprocess** for ML | scikit-learn's TF-IDF is battle-tested. Kept ML code cleanly separated from the API layer. |
| **Express** over Fastify/Hapi | Minimal boilerplate, familiar ecosystem, fast enough for this workload. |
| **Next.js App Router** | Built-in SSR capability, TypeScript first-class, Vercel deploy target. |
| **No Redux / Zustand** | State is simple enough for React `useState` + `useCallback` — avoided over-engineering. |
| **Framer Motion** | Smooth spring animations on the bottom sheet and cluster bars without writing CSS keyframes by hand. |

### The Clustering Algorithm

```
Articles → TF-IDF matrix → Cosine similarity → Threshold grouping → Cluster labels
```

- Each article's title + body is tokenised and vectorised into a TF-IDF matrix
- Pairwise cosine similarity is computed between all articles
- Articles with similarity > threshold are merged into a cluster
- The cluster label is set to the article title with the highest overall similarity score (most "central" article)
- Results are upserted into SQLite — re-runs don't duplicate articles (URL is the unique key)

---

## 🛠️ Tools & Technologies

### Frontend
| Tool | Version | Purpose |
|---|---|---|
| [Next.js](https://nextjs.org) | 16.2.9 | React framework with App Router |
| [React](https://react.dev) | 19.2.4 | UI rendering |
| [TypeScript](https://www.typescriptlang.org) | 5.x | Type safety |
| [Tailwind CSS](https://tailwindcss.com) | 4.x | Utility styling |
| [Framer Motion](https://www.framer.com/motion/) | 12.x | Animations (timeline bars, bottom sheet, panels) |
| [Lucide React](https://lucide.dev) | 1.x | Icon set |

### Backend
| Tool | Version | Purpose |
|---|---|---|
| [Node.js](https://nodejs.org) | 18+ | JavaScript runtime |
| [Express](https://expressjs.com) | 4.18 | REST API server |
| [sqlite3 + sqlite](https://github.com/TryGhost/node-sqlite3) | 5.x | Async SQLite driver |
| [uuid](https://github.com/uuidjs/uuid) | 9.x | Generate ingest job IDs |
| [cors](https://github.com/expressjs/cors) | 2.x | CORS middleware |
| [dotenv](https://github.com/motdotla/dotenv) | 16.x | Environment variable loading |

### Python Ingest Pipeline
| Tool | Version | Purpose |
|---|---|---|
| [feedparser](https://feedparser.readthedocs.io) | 6.0+ | Parse RSS/Atom feeds |
| [requests](https://requests.readthedocs.io) | 2.31+ | HTTP client for scraping |
| [BeautifulSoup4](https://www.crummy.com/software/BeautifulSoup/) | 4.12+ | HTML parsing / text extraction |
| [lxml](https://lxml.de) | 4.9+ | Fast HTML/XML parser backend |
| [scikit-learn](https://scikit-learn.org) | 1.3+ | TF-IDF vectorisation + cosine similarity |
| [NumPy](https://numpy.org) | 1.24+ | Matrix operations |

### Dev & Deploy
| Tool | Purpose |
|---|---|
| [nodemon](https://nodemon.io) | Auto-restart backend in dev |
| [Render](https://render.com) | Backend hosting (Node.js + Python on same instance) |
| [Vercel](https://vercel.com) | Frontend hosting (zero-config Next.js) |
| [Git](https://git-scm.com) | Version control |

---

## 🚀 How to Run Locally

### Prerequisites
- **Node.js** 18 or higher — [Download](https://nodejs.org)
- **Python** 3.9 or higher — [Download](https://python.org)
- **npm** (comes with Node.js)

### 1. Clone the repo

```bash
git clone https://github.com/GLITCHINvision/news_pipeline_project.git
cd news_pipeline_project
```

### 2. Set up the Backend

```bash
cd backend

# Install Node.js dependencies
npm install

# Create a Python virtual environment
python -m venv .venv

# Activate the virtual environment
# On Windows:
.venv\Scripts\activate
# On Mac/Linux:
source .venv/bin/activate

# Install Python dependencies
pip install -r requirements.txt

# Start the backend server
node server.js
```

✅ Backend runs at **http://localhost:5000**

The database (`db.sqlite`) is created automatically on first run. The schema is initialised from `schema.sql` if tables don't exist yet.

### 3. Set up the Frontend

Open a **new terminal**:

```bash
cd frontend

# Install dependencies
npm install

# Start the dev server
npm run dev
```

✅ Frontend runs at **http://localhost:3000**

### 4. Ingest News Data

Once both servers are running:

1. Open **http://localhost:3000** in your browser
2. Click **"Refresh Feeds"** in the top-right corner
3. Watch the progress strip — the Python scraper fetches ~70 articles, extracts full text, clusters them, and saves to the DB
4. The timeline populates automatically when ingestion completes (~30–60 seconds)

---

## 📁 Project Structure

```
news_pipeline_project/
│
├── backend/
│   ├── server.js          # Express API server — all REST endpoints
│   ├── ingest.py          # Python pipeline: fetch → scrape → cluster → store
│   ├── schema.sql         # SQLite table definitions
│   ├── requirements.txt   # Python dependencies
│   ├── package.json       # Node.js dependencies
│   └── .gitignore         # Ignores .venv, db.sqlite, node_modules
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx       # Main timeline UI (1,000+ lines — the whole app)
│   │   │   ├── layout.tsx     # Root layout + metadata
│   │   │   └── globals.css    # Design system: tokens, animations, components
│   │   └── types/
│   │       └── index.ts       # Shared TypeScript type definitions
│   ├── public/            # Static assets
│   ├── package.json
│   └── README.md
│
├── render.yaml            # Render.com backend deployment config
├── .gitignore             # Root-level ignores
└── README.md              # This file
```

---

## 🌐 API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api` | Health check + DB stats (article & cluster count) |
| `GET` | `/api/clusters` | All clusters ordered by latest article date |
| `GET` | `/api/clusters/:id` | Single cluster with full article list |
| `GET` | `/api/timeline` | Clusters with startTime/endTime for timeline rendering |
| `POST` | `/api/ingest/trigger` | Start the Python scraper (async, returns `jobId`) |
| `GET` | `/api/ingest/status/:jobId` | Poll job status: `running` / `completed` / `failed` |

---

## ☁️ Deployment

| Service | Platform | Notes |
|---|---|---|
| **Backend** | [Render](https://render.com) | Free tier. Build: `npm install && pip install -r requirements.txt`. Supports Node + Python on same instance. |
| **Frontend** | [Vercel](https://vercel.com) | Free tier. Auto-detects Next.js. Zero config. |

### Environment Variables

Set these **before deploying**:

**On Render (backend):**
```
FRONTEND_URL=https://your-app.vercel.app
PORT=5000
NODE_ENV=production
```

**On Vercel (frontend):**
```
NEXT_PUBLIC_API_URL=https://your-backend.onrender.com
```

See [`render.yaml`](./render.yaml) for the full Render service configuration.

---

## 📝 License

MIT — feel free to use, modify, and distribute.
