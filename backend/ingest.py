
import os
import sys
import sqlite3
import hashlib
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
import re
import requests
from bs4 import BeautifulSoup
import numpy as np


try:
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import cosine_similarity
except ImportError:
    print("[ERROR] scikit-learn is not installed in the active environment.")
    sys.exit(1)


try:
    import feedparser
except ImportError:
    feedparser = None


DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "db.sqlite")
SCHEMA_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "schema.sql")

FEEDS = {
    "BBC News": "http://feeds.bbci.co.uk/news/rss.xml",
    "NPR": "https://feeds.npr.org/1001/rss.xml",
    "Al Jazeera": "https://www.aljazeera.com/xml/rss/all.xml"
}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
}

def init_db():
    """Initializes the SQLite database if it hasn't been initialized yet."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    

    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='articles'")
    if not cursor.fetchone():
        print(f"[DB] Initializing database using {SCHEMA_PATH}")
        with open(SCHEMA_PATH, "r") as f:
            cursor.executescript(f.read())
        conn.commit()
    conn.close()

def generate_article_id(url):
    """Generates a stable unique ID based on the URL."""
    return hashlib.md5(url.encode('utf-8')).hexdigest()

def normalize_date(date_str):
    """Normalizes various RSS date formats into ISO 8601 UTC format."""
    if not date_str:
        return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    

    cleaned = date_str.strip()
    if re.search(r'[+-]\d{2}:\d{2}Z$', cleaned):
        cleaned = cleaned[:-1]
    elif re.search(r'[+-]\d{4}Z$', cleaned):
        cleaned = cleaned[:-1]
        
    formats = [
        "%a, %d %b %Y %H:%M:%S %Z",  
        "%a, %d %b %Y %H:%M:%S %z",  
        "%Y-%m-%dT%H:%M:%SZ",        
        "%Y-%m-%dT%H:%M:%S%z",
        "%d %b %Y %H:%M:%S %Z",
        "%Y-%m-%d %H:%M:%S"
    ]
    
    for fmt in formats:
        try:
            dt = datetime.strptime(cleaned, fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            else:
                dt = dt.astimezone(timezone.utc)
            return dt.strftime("%Y-%m-%dT%H:%M:%SZ")
        except ValueError:
            continue
            
   
    try:
        import email.utils
        parsed = email.utils.parsedate_to_datetime(cleaned)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        else:
            parsed = parsed.astimezone(timezone.utc)
        return parsed.strftime("%Y-%m-%dT%H:%M:%SZ")
    except Exception:
        pass

    
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

def extract_full_text(url):
    """Fetches the article webpage and extracts the body paragraphs."""
    try:
        response = requests.get(url, headers=HEADERS, timeout=10)
        if response.status_code != 200:
            return ""
            
        soup = BeautifulSoup(response.text, 'lxml' if 'lxml' in sys.modules else 'html.parser')
        
    
        for element in soup(["script", "style", "nav", "footer", "header", "aside", "form"]):
            element.extract()
            
    
        article_text = []
        
       
        body_container = None
        for selector in ['article', '[itemprop="articleBody"]', '.article-body', '.story-body', '.story-content', '.main-content']:
            found = soup.select_one(selector)
            if found:
                body_container = found
                break
                
     
        if body_container:
            paragraphs = body_container.find_all('p')
        else:
          
            paragraphs = soup.find_all('p')
            
        for p in paragraphs:
            text = p.get_text().strip()
          
            if len(text) > 40 and not any(term in text.lower() for term in ["cookie", "subscribe", "terms of use", "privacy policy"]):
                article_text.append(text)
                
        full_text = "\n\n".join(article_text)
        return full_text
    except Exception as e:
        print(f"[WARN] Failed to extract text for {url}: {e}")
        return ""

def fetch_rss_feeds():
    """Fetches RSS feeds and saves new articles in the database."""
    print("[FETCHING] Fetching news RSS feeds...")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    new_articles_count = 0
    total_found = 0
    
    for source_name, feed_url in FEEDS.items():
        print(f"[FETCHING] Connecting to {source_name} feed...")
        try:
            response = requests.get(feed_url, headers=HEADERS, timeout=10)
            if response.status_code != 200:
                print(f"[WARN] Feed {source_name} returned status code {response.status_code}")
                continue
                
            xml_data = response.content
            
            
            if feedparser:
                feed = feedparser.parse(xml_data)
                entries = feed.entries
            else:
              
                root = ET.fromstring(xml_data)
                entries = []
                for item in root.findall('.//item'):
                    entry = {
                        'title': item.findtext('title', ''),
                        'link': item.findtext('link', ''),
                        'description': item.findtext('description', ''),
                        'published': item.findtext('pubDate', '')
                    }
                    entries.append(entry)
            
            for entry in entries:
                total_found += 1
                if feedparser:
                    title = entry.get('title', '')
                    url = entry.get('link', '')
                    summary = entry.get('summary', '') or entry.get('description', '')
                    pub_date = entry.get('published', '') or entry.get('pubDate', '')
                else:
                    title = entry['title']
                    url = entry['link']
                    summary = entry['description']
                    pub_date = entry['published']
                
                if not url or not title:
                    continue
                
                article_id = generate_article_id(url)
                cursor.execute("SELECT id FROM articles WHERE id = ?", (article_id,))
                if cursor.fetchone():
                    continue  
                
                
                title = BeautifulSoup(title, "html.parser").get_text()
                if summary:
                    summary = BeautifulSoup(summary, "html.parser").get_text()
                
                published_at = normalize_date(pub_date)
                
                cursor.execute(
                    """
                    INSERT INTO articles (id, title, summary, body, url, source, published_at)
                    VALUES (?, ?, ?, NULL, ?, ?, ?)
                    """,
                    (article_id, title, summary, url, source_name, published_at)
                )
                new_articles_count += 1
                
        except Exception as e:
            print(f"[ERROR] Failed to fetch feed for {source_name}: {e}")
            
    conn.commit()
    conn.close()
    print(f"[FETCHED] Fetched {new_articles_count} new articles (Total seen: {total_found}).")
    return new_articles_count

def extract_missing_bodies():
    """Iterates through articles with empty bodies and extracts full text."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute("SELECT id, url, title FROM articles WHERE body IS NULL OR body = ''")
    missing_body_articles = cursor.fetchall()
    
    if not missing_body_articles:
        print("[SCRAPE] All articles have body text. No extraction needed.")
        conn.close()
        return
        
    print(f"[SCRAPING] Extracting full text for {len(missing_body_articles)} articles...")
    
    success_count = 0
    for article_id, url, title in missing_body_articles:
        # Print mini progress
        sys.stdout.write(f"[SCRAPING] Fetching: {title[:40]}...\n")
        sys.stdout.flush()
        
        body_text = extract_full_text(url)
        if body_text:
            cursor.execute("UPDATE articles SET body = ? WHERE id = ?", (body_text, article_id))
            success_count += 1
            
            conn.commit()
            
    conn.close()
    print(f"[SCRAPE_DONE] Finished full-text extraction. Successfully parsed {success_count}/{len(missing_body_articles)} bodies.")

def cluster_articles(similarity_threshold=0.35):
    """Clusters all articles in the database using TF-IDF and Cosine Similarity."""
    print("[CLUSTERING] Running clustering algorithm...")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
   
    cursor.execute("SELECT id, title, summary, body, published_at FROM articles")
    articles = cursor.fetchall()
    
    if not articles:
        print("[CLUSTERING] No articles found to cluster.")
        conn.close()
        return
        
    
    documents = []
    article_ids = []
    
    for art_id, title, summary, body, pub_at in articles:
        
        combined_text = f"{title}. "
        if summary:
            combined_text += f"{summary}. "
        if body:
            combined_text += body
            
        documents.append(combined_text)
        article_ids.append(art_id)
        

    vectorizer = TfidfVectorizer(stop_words='english', max_df=0.9, min_df=1)
    tfidf_matrix = vectorizer.fit_transform(documents)
    
  
    cosine_sim = cosine_similarity(tfidf_matrix, tfidf_matrix)
    
  
    n_articles = len(articles)
    visited = [False] * n_articles
    components = []
    
    for i in range(n_articles):
        if not visited[i]:
      
            component = []
            queue = [i]
            visited[i] = True
            
            while queue:
                curr = queue.pop(0)
                component.append(curr)
                
                for neighbor in range(n_articles):
                    if not visited[neighbor]:
                      
                        if cosine_sim[curr][neighbor] >= similarity_threshold:
                            visited[neighbor] = True
                            queue.append(neighbor)
            components.append(component)
            
    print(f"[CLUSTERING] Formed {len(components)} raw clusters from {n_articles} articles.")
    

    cursor.execute("DELETE FROM clusters")
    cursor.execute("UPDATE articles SET cluster_id = NULL")
    conn.commit()
    

    for idx, comp in enumerate(components):
     
        
        comp_art_ids = [article_ids[i] for i in comp]
        comp_articles = [articles[i] for i in comp]
        
        cluster_label = ""
        
        if len(comp) == 1:
            cluster_label = comp_articles[0][1] 
        else:
           
            best_avg_sim = -1
            central_idx = 0
            
            for c_i, node_idx in enumerate(comp):
                sum_sim = 0
                for node_idx_other in comp:
                    sum_sim += cosine_sim[node_idx][node_idx_other]
                avg_sim = sum_sim / len(comp)
                if avg_sim > best_avg_sim:
                    best_avg_sim = avg_sim
                    central_idx = c_i
                    
            representative_headline = comp_articles[central_idx][1]
            
           
            cluster_combined_text = " ".join([documents[i] for i in comp])
            cluster_tfidf = vectorizer.transform([cluster_combined_text])
            
            feature_names = np.array(vectorizer.get_feature_names_out())
            tfidf_sorting = np.argsort(cluster_tfidf.toarray()[0])[::-1]
            
           
            keywords = []
            for kw_idx in tfidf_sorting[:5]:
                word = feature_names[kw_idx]
             
                if len(word) > 2 and not word.isdigit():
                    keywords.append(word.capitalize())
                if len(keywords) >= 3:
                    break
            
            if keywords:
                keyword_tag = f" ({', '.join(keywords)})"
            else:
                keyword_tag = ""
                
         
            truncated_headline = representative_headline
            if len(truncated_headline) > 75:
                truncated_headline = truncated_headline[:72] + "..."
                
            cluster_label = f"{truncated_headline}{keyword_tag}"
            
     
        cursor.execute("INSERT INTO clusters (label) VALUES (?)", (cluster_label,))
        cluster_db_id = cursor.lastrowid
        
      
        for art_id in comp_art_ids:
            cursor.execute("UPDATE articles SET cluster_id = ? WHERE id = ?", (cluster_db_id, art_id))
            
    conn.commit()
    conn.close()
    print(f"[CLUSTERING_DONE] DB updated. Assigned {len(components)} clusters.")

def run_pipeline():
    """Runs the full ingestion pipeline: init -> fetch RSS -> scrape full texts -> cluster."""
    init_db()
    
 
    fetch_rss_feeds()
    

    extract_missing_bodies()
    
 
    cluster_articles()
    
    print("[INGEST_SUCCESS] Ingestion and clustering completed successfully.")

if __name__ == "__main__":
    run_pipeline()
