# Health check endpoint
# To integrate into main.py, add:
#   from server.routers import health
#   app.include_router(health.router)
# (No prefix or auth dependency needed - health checks should be unauthenticated)

from fastapi import APIRouter
import time

router = APIRouter()

start_time = time.time()

@router.get("/api/health")
async def health():
    return {
        "status": "ok",
        "uptime_seconds": int(time.time() - start_time)
    }
