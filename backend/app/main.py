"""Eero Dashboard Backend - FastAPI Application."""

import asyncio
import logging
from contextlib import asynccontextmanager
from importlib.metadata import version as pkg_version
from pathlib import Path

from eero.exceptions import (
    EeroAccessDeniedException,
    EeroAPIException,
    EeroAuthenticationException,
    EeroClientBlockedException,
    EeroException,
    EeroFeatureUnavailableException,
    EeroNetworkException,
    EeroNotFoundException,
    EeroPremiumRequiredException,
    EeroRateLimitException,
    EeroTimeoutException,
    EeroValidationException,
)
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware

from .config import settings
from .deps import (
    AccountIdentityWriteDisabledError,
    ExperimentalWriteDisabledError,
    clear_client_session,
    get_eero_client,
    shutdown_client,
)
from .routes import account, auth, devices, eeros, metrics, networks, profiles
from .services.collector import MetricsCollector
from .services.victoria import victoria_client


def get_eero_client_version() -> str:
    """Get the installed eero-api version."""
    try:
        return pkg_version("eero-api")
    except Exception:  # pylint: disable=broad-exception-caught
        # Deliberate fail-safe: version lookup is cosmetic, never fatal.
        return "unknown"


def _remove_legacy_exporter_session_file() -> None:
    """Remove the legacy exporter session file, if any, on startup.

    Volumes upgraded from eero-ui 5.x may still carry
    ``exporter-session.json`` -- a full copy of the eero session token that
    the now-deleted exporter-sync code used to write next to the main
    cookie file. Nothing deletes it any more, so clean it up once here.
    This is a one-shot best-effort cleanup, not a security boundary: it
    never logs the file's path or contents.
    """
    legacy_path = Path(settings.cookie_file).parent / "exporter-session.json"
    try:
        if legacy_path.exists():
            legacy_path.unlink()
            _LOGGER.info("Removed legacy exporter session file")
    except OSError as e:
        _LOGGER.warning("Failed to remove legacy exporter session file: %s", e)


# Configure logging
logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
_LOGGER = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager.

    Starts the metrics collector task (see ``services/collector.py``,
    phase-6.0-revamp.md § 2.2) after the app is up, and tears it down
    before the shared EeroClient and VictoriaMetrics client are closed.
    """
    _LOGGER.info("Starting Eero Dashboard Backend")
    _remove_legacy_exporter_session_file()
    collector = MetricsCollector(
        get_eero_client,
        victoria_client,
        interval_seconds=settings.collection_interval,
    )
    app.state.metrics_collector = collector
    collector_task = asyncio.create_task(collector.run_forever())

    yield

    _LOGGER.info("Shutting down Eero Dashboard Backend")
    collector_task.cancel()
    try:
        await collector_task
    except asyncio.CancelledError:
        pass
    await shutdown_client()
    await victoria_client.aclose()


# Create FastAPI application
app = FastAPI(
    title="Eero Dashboard API",
    description="REST API wrapper for eero-api with embedded metrics",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs" if settings.debug else None,
    redoc_url="/api/redoc" if settings.debug else None,
)

# Rate limiting - add limiter state and exception handler
app.state.limiter = auth.limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS middleware for development
if settings.debug:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# CSRF guard (SECURITY-SME finding, 2026-09-24): the frontend authenticates
# with an httpOnly cookie, so any cross-site page can make the browser send
# it automatically on a state-changing request. This is a lightweight
# custom-header check (not a token scheme) - a cross-site <form> or
# fetch("no-cors") cannot set an arbitrary request header, so requiring one
# is sufficient to block simple/no-cors CSRF while adding no state and no
# extra round trip. Every POST/PUT/PATCH/DELETE under /api must carry
# ``X-Requested-With: eero-ui``; GET/HEAD/OPTIONS are exempt (they must
# stay side-effect-free anyway), and nothing outside /api is covered
# (the SPA catch-all is not a same-origin-trust boundary). No path is
# exempted - a route that legitimately needs to be called cross-site
# (there are none today) would need a deliberate, separate carve-out.
_CSRF_HEADER_NAME = "x-requested-with"
_CSRF_HEADER_VALUE = "eero-ui"
_CSRF_GUARDED_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})


async def _csrf_guard_middleware(request: Request, call_next):
    if (
        request.method in _CSRF_GUARDED_METHODS
        and request.url.path.startswith("/api/")
        and request.headers.get(_CSRF_HEADER_NAME, "").lower() != _CSRF_HEADER_VALUE
    ):
        return JSONResponse(
            status_code=403,
            content={
                "detail": "Missing or invalid X-Requested-With header.",
                "type": "csrf",
            },
        )
    return await call_next(request)


app.add_middleware(BaseHTTPMiddleware, dispatch=_csrf_guard_middleware)


# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Handle uncaught exceptions."""
    # Log full details server-side, return generic message to client
    _LOGGER.exception("Unhandled exception occurred")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


# ---------------------------------------------------------------------------
# eero-api exception -> HTTP mapping (phase-6.0-revamp.md § 3.4)
#
# Registered by subclass before base so a caller instantiating a subclass
# always gets the most specific mapping; Starlette's own dispatch walks
# type(exc).__mro__ from the concrete type upward, so this ordering is
# belt-and-braces rather than load-bearing, but keeping it explicit matches
# the table exactly and avoids relying on that lookup detail.
#
# The SDK message (``str(exc)``) and the raw envelope are never surfaced in
# ``detail`` - only the static strings below. ``envelope`` is logged, if at
# all, only at DEBUG.
# ---------------------------------------------------------------------------


@app.exception_handler(EeroAuthenticationException)
async def eero_authentication_exception_handler(
    request: Request, exc: EeroAuthenticationException
) -> JSONResponse:
    """A dead/expired session: clear the stored token so /auth/status agrees."""
    _LOGGER.warning("Session expired or invalid")
    await clear_client_session()
    return JSONResponse(
        status_code=401,
        content={
            "detail": "Session expired. Please log in again.",
            "reason": "expired",
        },
        headers={"WWW-Authenticate": "Bearer"},
    )


@app.exception_handler(EeroNotFoundException)
async def eero_not_found_exception_handler(
    request: Request, exc: EeroNotFoundException
) -> JSONResponse:
    """A resource the eero cloud does not have."""
    resource = (exc.resource_type or "Resource").capitalize()
    return JSONResponse(status_code=404, content={"detail": f"{resource} not found."})


@app.exception_handler(EeroAccessDeniedException)
async def eero_access_denied_exception_handler(
    request: Request, exc: EeroAccessDeniedException
) -> JSONResponse:
    """Authenticated, but not permitted to perform this action."""
    return JSONResponse(
        status_code=403,
        content={"detail": "Your eero account does not permit this action."},
    )


@app.exception_handler(EeroPremiumRequiredException)
async def eero_premium_required_exception_handler(
    request: Request, exc: EeroPremiumRequiredException
) -> JSONResponse:
    """The feature requires an eero Plus/Secure subscription."""
    return JSONResponse(
        status_code=402,
        content={
            "detail": "This feature requires an eero Plus/Secure subscription.",
            "type": "premium_required",
        },
    )


@app.exception_handler(ExperimentalWriteDisabledError)
async def experimental_write_disabled_exception_handler(
    request: Request, exc: ExperimentalWriteDisabledError
) -> JSONResponse:
    """The write is gated behind ``EERO_DASHBOARD_EXPERIMENTAL_WRITES``
    (phase-6.0-revamp.md § 5, decision 6a; WP7)."""
    return JSONResponse(
        status_code=403,
        content={
            "detail": (
                "This write is disabled. Set "
                "EERO_DASHBOARD_EXPERIMENTAL_WRITES=true to enable it."
            ),
            "type": "experimental_disabled",
        },
    )


@app.exception_handler(AccountIdentityWriteDisabledError)
async def account_identity_write_disabled_exception_handler(
    request: Request, exc: AccountIdentityWriteDisabledError
) -> JSONResponse:
    """The write is gated behind ``EERO_DASHBOARD_ACCOUNT_IDENTITY_WRITES``,
    in addition to the experimental-writes gate (SECURITY-SME finding,
    2026-09-24)."""
    return JSONResponse(
        status_code=403,
        content={
            "detail": (
                "This write is disabled. Set "
                "EERO_DASHBOARD_ACCOUNT_IDENTITY_WRITES=true to enable it."
            ),
            "type": "account_identity_disabled",
        },
    )


@app.exception_handler(EeroFeatureUnavailableException)
async def eero_feature_unavailable_exception_handler(
    request: Request, exc: EeroFeatureUnavailableException
) -> JSONResponse:
    """The feature is not available on this network right now."""
    return JSONResponse(
        status_code=409,
        content={
            "detail": "This feature is not available on this network right now.",
            "type": "feature_unavailable",
            "error_code": exc.error_code,
        },
    )


@app.exception_handler(EeroClientBlockedException)
async def eero_client_blocked_exception_handler(
    request: Request, exc: EeroClientBlockedException
) -> JSONResponse:
    """The eero cloud rejected this client version."""
    _LOGGER.error(
        "eero cloud rejected the client version: error_code=%s", exc.error_code
    )
    return JSONResponse(
        status_code=503,
        content={
            "detail": "The eero cloud rejected this client version; update eero-ui."
        },
    )


@app.exception_handler(EeroRateLimitException)
async def eero_rate_limit_exception_handler(
    request: Request, exc: EeroRateLimitException
) -> JSONResponse:
    """The eero cloud rate-limited this account."""
    return JSONResponse(
        status_code=429,
        content={"detail": "eero rate limit hit. Try again shortly."},
        headers={"Retry-After": "60"},
    )


@app.exception_handler(EeroValidationException)
async def eero_validation_exception_handler(
    request: Request, exc: EeroValidationException
) -> JSONResponse:
    """Client-side or API-reported validation failure."""
    return JSONResponse(
        status_code=422,
        content={"detail": {"field": exc.field, "message": str(exc)}},
    )


@app.exception_handler(EeroNetworkException)
async def eero_network_exception_handler(
    request: Request, exc: EeroNetworkException
) -> JSONResponse:
    """Transport-level failure reaching the eero cloud."""
    return JSONResponse(
        status_code=503,
        content={"detail": "eero cloud unreachable. Try again."},
    )


@app.exception_handler(EeroTimeoutException)
async def eero_timeout_exception_handler(
    request: Request, exc: EeroTimeoutException
) -> JSONResponse:
    """A request to the eero cloud timed out."""
    return JSONResponse(
        status_code=503,
        content={"detail": "eero cloud unreachable. Try again."},
    )


@app.exception_handler(EeroAPIException)
async def eero_api_exception_handler(
    request: Request, exc: EeroAPIException
) -> JSONResponse:
    """Catch-all for any other eero cloud API error response."""
    _LOGGER.error(
        "eero cloud API error: error_code=%s status_code=%s",
        exc.error_code,
        exc.status_code,
    )
    _LOGGER.debug("eero cloud API error envelope: %s", exc.envelope)
    return JSONResponse(
        status_code=502,
        content={"detail": "eero cloud returned an error."},
    )


@app.exception_handler(EeroException)
async def eero_base_exception_handler(
    request: Request, exc: EeroException
) -> JSONResponse:
    """Any other/base eero-api exception - existing global 500 behaviour.

    Registered explicitly for ``EeroException`` (not just bare ``Exception``)
    so it is handled by Starlette's ``ExceptionMiddleware`` like every other
    typed handler above, rather than being promoted to
    ``ServerErrorMiddleware``'s handler slot - which re-raises after
    building the response, a behaviour meant for truly uncaught errors, not
    a documented part of this mapping.
    """
    return await global_exception_handler(request, exc)


# Include API routers
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(networks.router, prefix="/api/networks", tags=["Networks"])
app.include_router(devices.router, prefix="/api/devices", tags=["Devices"])
app.include_router(eeros.router, prefix="/api/eeros", tags=["Eeros"])
app.include_router(profiles.router, prefix="/api/profiles", tags=["Profiles"])
app.include_router(metrics.router, prefix="/api/metrics", tags=["Metrics"])
app.include_router(account.router, prefix="/api/account", tags=["Account"])


# Health check
@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    response = {
        "status": "healthy",
        "version": "1.0.0",
        "eero_client_version": get_eero_client_version(),
        # So the frontend can hide gated controls without a round trip
        # through /auth/status (decision 6a).
        "experimental_writes": settings.experimental_writes,
    }
    return response


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
        """Serve the SPA for all non-API routes.

        `/metrics` has no replacement endpoint (see phase-6.0-revamp.md § 2.4)
        and any `/api/*` path that no router claimed is a genuine 404 --
        neither should ever fall through to index.html.
        """
        if full_path == "metrics" or full_path.startswith("metrics/"):
            raise HTTPException(status_code=404, detail="Not Found")
        if full_path == "api" or full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not Found")

        # Resolve the requested file path
        file_path = (frontend_dist / full_path).resolve()

        # Security: Prevent path traversal attacks
        # Ensure the resolved path is within the frontend_dist directory
        try:
            file_path.relative_to(frontend_dist_resolved)
        except ValueError:
            # Path traversal attempt detected - serve index.html instead
            _LOGGER.warning("Path traversal attempt blocked: %s", full_path)
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
