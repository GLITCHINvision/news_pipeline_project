# NewsPulse — Topic-Clustered News Timeline

A real-time news aggregation and visualization platform that fetches articles from BBC News, NPR, and Al Jazeera, clusters them by topic using TF-IDF + cosine similarity, and displays them as an interactive timeline.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS, Framer Motion |
| Backend | Node.js, Express.js, SQLite (via better-sqlite3) |
| Ingest | Python 3, feedparser, BeautifulSoup4, scikit-learn |

---

## Features

- 📡 **Live RSS ingestion** from BBC News, NPR, Al Jazeera
- 🧠 **TF-IDF + cosine similarity** topic clustering
- 📊 **Interactive timeline** — visualize how news stories evolve over time
- 🔍 **Search & filter** by source and keyword
- 🌙 **Dark / Light mode** with persistence
- 📱 **Fully responsive** — mobile bottom sheet + desktop sidebar
- ⚡ **Auto-refresh** every 30 seconds

---

## Project Structure

```
assesment_final/
├── backend/
│   ├── server.js          # Express API server
│   ├── ingest.py          # Python RSS fetcher + TF-IDF clusterer
│   ├── schema.sql         # SQLite schema
│   ├── requirements.txt   # Python dependencies
│   └── package.json
├── frontend/
│   ├── src/app/
│   │   ├── page.tsx       # Main timeline UI
│   │   └── globals.css    # Global styles & design tokens
│   └── package.json
├── render.yaml            # Render.com deploy config
└── .gitignore
```

---

## Local Development

### 1. Backend

```bash
cd backend
npm install
pip install -r requirements.txt   # or: python -m pip install -r requirements.txt
node server.js
# API running at http://localhost:5000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
# App running at http://localhost:3000
```

---

## Deployment

- **Backend** → [Render](https://render.com) (supports Node.js + Python on same instance)
- **Frontend** → [Vercel](https://vercel.com) (zero-config Next.js deploy)

See [render.yaml](../render.yaml) for the Render service configuration.

### Environment Variables

| Variable | Where | Value |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Vercel (frontend) | Your Render backend URL |
| `FRONTEND_URL` | Render (backend) | Your Vercel frontend URL |

---

## API Endpoints

| Method | Route | Description |
|---|---|---|
| GET | `/api` | Server status + DB stats |
| GET | `/api/clusters` | All topic clusters with article counts |
| GET | `/api/clusters/:id` | Cluster detail with full article list |
| GET | `/api/timeline` | Timeline-formatted cluster data |
| POST | `/api/ingest/trigger` | Trigger Python scraper |
| GET | `/api/ingest/status/:jobId` | Poll scrape job status |
