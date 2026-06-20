// server.js
// Express API backend for News Pulse - Async SQLite Version

const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 5000;

// Allow local dev + production frontend (set FRONTEND_URL env var on Render)
const allowedOrigins = [
  'http://localhost:3000',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Postman, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  }
}));
app.use(express.json());

const DB_PATH = path.join(__dirname, 'db.sqlite');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

let db;

// Initialize database connection
async function initDb() {
    try {
        db = await open({
            filename: DB_PATH,
            driver: sqlite3.Database
        });
        
        // Enable WAL mode for better concurrency
        await db.exec('PRAGMA journal_mode = WAL');
        
        // Check if tables exist, if not create them
        const tablesExist = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='articles'");
        if (!tablesExist) {
            console.log("Database empty. Initializing schema...");
            const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf8');
            await db.exec(schemaSql);
            console.log("Schema initialized successfully.");
        } else {
            console.log("Database connected successfully.");
        }
    } catch (err) {
        console.error("Failed to connect to SQLite database:", err);
        process.exit(1);
    }
}

// Spawn Python process for scraping & clustering
async function triggerIngest(jobId) {
    const pythonExe = process.platform === 'win32' 
        ? path.join(__dirname, '.venv', 'Scripts', 'python.exe') 
        : path.join(__dirname, '.venv', 'bin', 'python');
        
    const scriptPath = path.join(__dirname, 'ingest.py');
    
    console.log(`[Job ${jobId}] Spawning scraper process: ${pythonExe} ${scriptPath}`);
    
    const child = spawn(pythonExe, [scriptPath], {
        cwd: __dirname,
        env: { ...process.env, PYTHONUNBUFFERED: '1' }
    });
    
    let errorOutput = '';
    
    child.stdout.on('data', (data) => {
        console.log(`[Python stdout] ${data.toString().trim()}`);
    });
    
    child.stderr.on('data', (data) => {
        const msg = data.toString().trim();
        console.error(`[Python stderr] ${msg}`);
        errorOutput += msg + '\n';
    });
    
    child.on('close', async (code) => {
        console.log(`[Job ${jobId}] Python process exited with code ${code}`);
        try {
            if (code === 0) {
                await db.run("UPDATE ingest_jobs SET status = ?, error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", 'completed', null, jobId);
            } else {
                await db.run("UPDATE ingest_jobs SET status = ?, error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", 'failed', errorOutput || `Exit code ${code}`, jobId);
            }
        } catch (dbErr) {
            console.error("Error updating job status on process close:", dbErr);
        }
    });
    
    child.on('error', async (err) => {
        console.error(`[Job ${jobId}] Failed to spawn Python process:`, err);
        try {
            await db.run("UPDATE ingest_jobs SET status = ?, error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", 'failed', err.message, jobId);
        } catch (dbErr) {
            console.error("Error updating job status on process spawn error:", dbErr);
        }
    });
}

// --- Endpoints ---

// 1. GET /api/clusters - Retrieve list of clusters with summary stats
app.get('/api/clusters', async (req, res) => {
    try {
        const clusters = await db.all(`
            SELECT 
                c.id, 
                c.label, 
                COUNT(a.id) as articleCount,
                MIN(a.published_at) as earliestArticle,
                MAX(a.published_at) as latestArticle,
                GROUP_CONCAT(DISTINCT a.source) as sources
            FROM clusters c
            LEFT JOIN articles a ON c.id = a.cluster_id
            GROUP BY c.id
            HAVING articleCount > 0
            ORDER BY latestArticle DESC
        `);
        const formatted = clusters.map(c => ({
            ...c,
            sources: c.sources ? c.sources.split(',') : []
        }));
        res.json(formatted);
    } catch (err) {
        console.error("GET /api/clusters error:", err);
        res.status(500).json({ error: "Failed to fetch clusters" });
    }
});

// 2. GET /api/clusters/:id - Full cluster detail with chronological articles
app.get('/api/clusters/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const cluster = await db.get("SELECT * FROM clusters WHERE id = ?", id);
        if (!cluster) {
            return res.status(404).json({ error: "Cluster not found" });
        }
        
        const articles = await db.all("SELECT * FROM articles WHERE cluster_id = ? ORDER BY published_at ASC", id);
        res.json({
            ...cluster,
            articles
        });
    } catch (err) {
        console.error(`GET /api/clusters/${id} error:`, err);
        res.status(500).json({ error: "Failed to fetch cluster details" });
    }
});

// 3. GET /api/timeline - Format data specifically for plotting
app.get('/api/timeline', async (req, res) => {
    try {
        const timelineData = await db.all(`
            SELECT 
                c.id, 
                c.label, 
                COUNT(a.id) as articleCount,
                MIN(a.published_at) as startTime,
                MAX(a.published_at) as endTime,
                GROUP_CONCAT(DISTINCT a.source) as sources
            FROM clusters c
            JOIN articles a ON c.id = a.cluster_id
            GROUP BY c.id
            ORDER BY startTime ASC
        `);
        
        const formatted = timelineData.map(c => {
            return {
                id: c.id,
                label: c.label,
                articleCount: c.articleCount,
                startTime: c.startTime,
                endTime: c.endTime,
                sources: c.sources ? c.sources.split(',') : [],
                size: c.articleCount
            };
        });
        
        res.json(formatted);
    } catch (err) {
        console.error("GET /api/timeline error:", err);
        res.status(500).json({ error: "Failed to fetch timeline data" });
    }
});

// 4. POST /api/ingest/trigger - Trigger Python scraper
app.post('/api/ingest/trigger', async (req, res) => {
    try {
        // Check if an ingest job is already running
        const activeJob = await db.get("SELECT id FROM ingest_jobs WHERE status IN ('pending', 'running')");
        if (activeJob) {
            return res.json({ jobId: activeJob.id, status: 'already_running' });
        }
        
        const jobId = uuidv4();
        
        // Save job record
        await db.run("INSERT INTO ingest_jobs (id, status) VALUES (?, ?)", jobId, 'running');
        
        // Trigger subprocess asynchronously
        triggerIngest(jobId);
        
        res.status(202).json({ jobId, status: 'running' });
    } catch (err) {
        console.error("POST /api/ingest/trigger error:", err);
        res.status(500).json({ error: "Failed to trigger ingestion process" });
    }
});

// 5. GET /api/ingest/status/:jobId - Poll ingestion job status
app.get('/api/ingest/status/:jobId', async (req, res) => {
    const { jobId } = req.params;
    try {
        const job = await db.get("SELECT status, error, created_at, updated_at FROM ingest_jobs WHERE id = ?", jobId);
        if (!job) {
            return res.status(404).json({ error: "Job not found" });
        }
        res.json(job);
    } catch (err) {
        console.error(`GET /api/ingest/status/${jobId} error:`, err);
        res.status(500).json({ error: "Failed to fetch job status" });
    }
});

// Serve DB stats on root
app.get('/api', async (req, res) => {
    try {
        const articleCountResult = await db.get("SELECT COUNT(*) as count FROM articles");
        const clusterCountResult = await db.get("SELECT COUNT(*) as count FROM clusters");
        res.json({
            status: "online",
            database: {
                articles: articleCountResult ? articleCountResult.count : 0,
                clusters: clusterCountResult ? clusterCountResult.count : 0
            }
        });
    } catch (err) {
        res.json({ status: "online", database: "error", error: err.message });
    }
});

// Start DB connection then listen
initDb().then(() => {
    app.listen(PORT, () => {
        console.log(`News Pulse API server running on http://localhost:${PORT}`);
    });
});
