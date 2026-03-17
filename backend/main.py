import os
import time
import hashlib
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import httpx
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="CycleCast Backend API Proxy")

# Allow requests from the Vite dev server (and the PWA IP)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict this
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_KEY = os.getenv("APIKey")
API_SECRET = os.getenv("APISecret")

if not API_KEY or not API_SECRET:
    raise ValueError("Missing APIKey or APISecret from .env")

def get_podcast_index_headers():
    """Generates the required SHA-1 Authentication headers for PodcastIndex"""
    api_header_time = str(int(time.time()))
    data_to_hash = API_KEY + API_SECRET + api_header_time
    sha_1 = hashlib.sha1(data_to_hash.encode('utf-8')).hexdigest()

    return {
        "X-Auth-Date": api_header_time,
        "X-Auth-Key": API_KEY,
        "Authorization": sha_1,
        "User-Agent": "CycleCast/1.5"
    }

PODCAST_INDEX_BASE_URL = "https://api.podcastindex.org/api/1.0"

@app.get("/api/search")
async def search_podcasts(q: str):
    """Proxy for /search/byterm"""
    headers = get_podcast_index_headers()
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(
                f"{PODCAST_INDEX_BASE_URL}/search/byterm",
                params={"q": q},
                headers=headers
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

@app.get("/api/episodes")
async def get_episodes(id: int):
    """Proxy for /episodes/byfeedid"""
    headers = get_podcast_index_headers()
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(
                f"{PODCAST_INDEX_BASE_URL}/episodes/byfeedid",
                params={"id": id, "max": 10}, # limit to 10 latest
                headers=headers
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to fetch episodes: {str(e)}")

@app.get("/api/stream")
async def stream_audio(url: str, request: Request):
    """
    Proxies an audio stream from a remote server to bypass CORS.
    Handles Range requests so iOS Safari can seek properly.
    """
    headers = {}
    range_header = request.headers.get("Range")
    if range_header:
        headers["Range"] = range_header
    headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

    # We use stream=True (via httpx.stream) to pipe chunks directly without loading 100MB into RAM
    client = httpx.AsyncClient(follow_redirects=True)
    
    # We don't use 'async with httpx.AsyncClient()' block tightly here because the StreamingResponse 
    # needs the connection to remain open while it yields.
    # httpx background tasks integration allows passing the streaming iterator directly.
    
    try:
        req = client.build_request("GET", url, headers=headers)
        response = await client.send(req, stream=True)
        
        # Pass along the exact headers the remote server gave us (like 206 Partial Content, Content-Length)
        resp_headers = {
            "Content-Type": response.headers.get("Content-Type", "audio/mpeg"),
            "Accept-Ranges": response.headers.get("Accept-Ranges", "bytes"),
        }
        if "Content-Length" in response.headers:
             resp_headers["Content-Length"] = response.headers["Content-Length"]
        if "Content-Range" in response.headers:
             resp_headers["Content-Range"] = response.headers["Content-Range"]
             
        async def stream_generator():
            try:
                async for chunk in response.aiter_bytes(chunk_size=8192):
                    yield chunk
            finally:
                await response.aclose()
                await client.aclose()
                
        return StreamingResponse(
            stream_generator(), 
            status_code=response.status_code, 
            headers=resp_headers
        )
    except Exception as e:
        await client.aclose()
        raise HTTPException(status_code=500, detail=f"Stream proxy failed: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    # Make sure to run on 0.0.0.0 so the mobile phone testing on 192.168.1.59 can access it
    # lsof -i :8001 -t
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)
