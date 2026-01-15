"""Eero Dashboard Backend - FastAPI Application."""

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .deps import shutdown_client
from .routes import auth, devices, eeros, networks, profiles

# Configure logging
logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
_LOGGER = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    _LOGGER.info("Starting Eero Dashboard Backend")
    yield
    _LOGGER.info("Shutting down Eero Dashboard Backend")
    await shutdown_client()


# Create FastAPI application
app = FastAPI(
    title="Eero Dashboard API",
    description="REST API wrapper for eero-client",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs" if settings.debug else None,
    redoc_url="/api/redoc" if settings.debug else None,
)

# CORS middleware for development
if settings.debug:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Handle uncaught exceptions."""
    _LOGGER.exception(f"Unhandled exception: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "type": type(exc).__name__},
    )


# Include API routers
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(networks.router, prefix="/api/networks", tags=["Networks"])
app.include_router(devices.router, prefix="/api/devices", tags=["Devices"])
app.include_router(eeros.router, prefix="/api/eeros", tags=["Eeros"])
app.include_router(profiles.router, prefix="/api/profiles", tags=["Profiles"])


# Health check
@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "version": "1.0.0"}


# Serve static frontend (production)
frontend_dist = Path(__file__).parent.parent.parent / "frontend" / "build"
if frontend_dist.exists():
    from fastapi.responses import FileResponse

    # Serve static assets (JS, CSS, etc.) - must come before SPA fallback
    app.mount(
        "/_app", StaticFiles(directory=str(frontend_dist / "_app")), name="static_app"
    )

    # Resolve frontend_dist once for security checks
    frontend_dist_resolved = frontend_dist.resolve()

    # SPA fallback: serve index.html for all non-API routes
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """Serve the SPA for all non-API routes."""
        # Resolve the requested file path
        file_path = (frontend_dist / full_path).resolve()

        # Security: Prevent path traversal attacks
        # Ensure the resolved path is within the frontend_dist directory
        try:
            file_path.relative_to(frontend_dist_resolved)
        except ValueError:
            # Path traversal attempt detected - serve index.html instead
            _LOGGER.warning(f"Path traversal attempt blocked: {full_path}")
            return FileResponse(frontend_dist / "index.html")

        # Check if it's a static file that exists
        if file_path.is_file():
            return FileResponse(file_path)
        # Otherwise serve index.html for client-side routing
        return FileResponse(frontend_dist / "index.html")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
    )
