import os
import time
import logging
from typing import Dict, Optional, List
from fastapi import FastAPI, Request, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, validator
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from backend import MetricsBackend

# Logging setup
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Simple in-memory rate limiter
limiter = Limiter(key_func=get_remote_address)

# Configuration
class Settings:
    PROMETHEUS_GATEWAY_URL = os.getenv('PROMETHEUS_GATEWAY_URL', 'http://pushgateway-svc:9091')
    JOB_NAME = os.getenv('METRICS_JOB_NAME', 'metrics_simulator')
    HOST = os.getenv('FASTAPI_HOST', '0.0.0.0')
    PORT = int(os.getenv('FASTAPI_PORT', 8000))
    DEBUG = os.getenv('DEBUG', 'false').lower() == 'true'
    ENV = os.getenv('ENV', 'production')
    NAMESPACE = os.getenv('NAMESPACE', 'birdseye')

    # Request limits
    MAX_METRICS_PER_REQUEST = int(os.getenv('MAX_METRICS_PER_REQUEST', 50))
    MAX_METRIC_VALUE = float(os.getenv('MAX_METRIC_VALUE', 1e15))
    MIN_METRIC_VALUE = float(os.getenv('MIN_METRIC_VALUE', -1e15))

    # 🔒 Apply Changes Rate Limit: 3 requests per 15 minutes per IP
    APPLY_CHANGES_PER_15MINUTES = int(os.getenv('APPLY_CHANGES_PER_15MINUTES', 3))

    # Generous limits for non-sensitive endpoints
    GENERAL_REQUESTS_PER_MINUTE = int(os.getenv('GENERAL_REQUESTS_PER_MINUTE', 300))


settings = Settings()

# FastAPI App Setup
app = FastAPI(
    title="Metrics Simulator API",
    description="A simple API for simulating Prometheus metrics with strict Apply Changes rate limiting",
    version="2.1.1",
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    openapi_url="/openapi.json" if settings.DEBUG else None
)

# Rate limiting middleware
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# CORS Configuration
def get_allowed_origins() -> List[str]:
    """Get allowed origins with security considerations"""
    allowed_origins = os.getenv('ALLOWED_ORIGINS', '').strip()

    if allowed_origins:
        origins = [origin.strip() for origin in allowed_origins.split(',') if origin.strip()]
        if origins:
            logger.info(f"CORS Origins configured: {origins}")
            return origins

    # Development fallback
    if settings.ENV == 'development':
        fallback_origins = [
            "http://localhost:3000",
            "http://localhost:8080",
            "http://127.0.0.1:3000"
        ]
        logger.warning(f"Development mode: using fallback CORS origins: {fallback_origins}")
        return fallback_origins

    # Production: fail if not configured
    error_msg = (
        "Production mode: ALLOWED_ORIGINS must be explicitly set. "
        "Refusing to start with wildcard origins for security."
    )
    logger.critical(error_msg)
    raise RuntimeError(error_msg)


try:
    allowed_origins = get_allowed_origins()
except RuntimeError as e:
    logger.critical("Failed to configure CORS: %s", e)
    raise SystemExit(1)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-Requested-With"],
    max_age=600,
)

# Enhanced Pydantic Models
class MetricPayload(BaseModel):
    value: float
    unit: Optional[str] = ""
    timestamp: Optional[int] = None

    @validator('value')
    def validate_value_range(cls, v):
        if not isinstance(v, (int, float)):
            raise ValueError('Value must be a number')
        if not (settings.MIN_METRIC_VALUE <= v <= settings.MAX_METRIC_VALUE):
            raise ValueError(f'Value must be between {settings.MIN_METRIC_VALUE} and {settings.MAX_METRIC_VALUE}')
        return float(v)

    @validator('unit')
    def validate_unit(cls, v):
        if v is None:
            return ""
        allowed_units = ['', 'bytes', 's', 'ms', '%', 'count', 'requests', 'errors']
        if v not in allowed_units:
            raise ValueError(f'Unit must be one of: {allowed_units}')
        return v

    @validator('timestamp')
    def validate_timestamp(cls, v):
        if v is not None:
            current_time = int(time.time() * 1000)
            if not (current_time - 86400000 <= v <= current_time + 3600000):
                raise ValueError('Timestamp is too old or too far in the future')
        return v


class MetricsRequest(BaseModel):
    metrics: Dict[str, MetricPayload]
    timestamp: Optional[int] = None

    @validator('metrics')
    def validate_metrics_count(cls, v):
        if len(v) == 0:
            raise ValueError('At least one metric is required')
        if len(v) > settings.MAX_METRICS_PER_REQUEST:
            raise ValueError(f'Too many metrics. Maximum allowed: {settings.MAX_METRICS_PER_REQUEST}')
        return v

    @validator('metrics')
    def validate_metric_names(cls, v):
        for name in v.keys():
            if not name:
                raise ValueError('Metric name cannot be empty')
            if len(name) > 200:
                raise ValueError(f'Metric name too long (max 200 chars): {name}')

            import re
            if not re.match(r'^[a-zA-Z_:][a-zA-Z0-9_:]*$', name):
                raise ValueError(
                    f'Invalid metric name format: {name}. '
                    'Must start with letter/underscore and contain only letters, numbers, underscores, and colons.'
                )
        return v


# Security middleware with request tracking
@app.middleware("http")
async def security_middleware(request: Request, call_next):
    """Security middleware with Apply Changes tracking"""
    client_ip = get_remote_address(request)

    # Request size limit
    max_size = int(os.getenv('MAX_REQUEST_SIZE', 1024 * 1024))
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            size = int(content_length)
            if size > max_size:
                logger.warning(f"🚫 Request too large from IP {client_ip}: {size} bytes")
                raise HTTPException(status_code=413, detail="Request body too large")
        except ValueError:
            logger.warning(f"🚫 Invalid Content-Length from IP {client_ip}")
            raise HTTPException(status_code=400, detail="Invalid request")

    # Track Apply Changes requests
    if request.method == "POST" and "/api/metrics/apply" in str(request.url):
        logger.info(f"🎯 Apply Changes request from IP: {client_ip}")

    # Process request
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time

    # Add security headers
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-Process-Time"] = f"{process_time:.4f}"

    # Add rate limit info to Apply Changes responses
    if request.method == "POST" and "/api/metrics/apply" in str(request.url) and response.status_code < 400:
        response.headers["X-RateLimit-Limit"] = str(settings.APPLY_CHANGES_PER_15MINUTES)
        response.headers["X-RateLimit-Window"] = "900s (15 minutes)"

    if settings.ENV == 'production':
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

    return response


# Initialize metrics backend
try:
    metrics_backend = MetricsBackend(
        prometheus_gateway_url=settings.PROMETHEUS_GATEWAY_URL,
        job_name=settings.JOB_NAME
    )
    logger.info("✅ Metrics backend initialized successfully")
except Exception as e:
    logger.error(f"❌ Failed to initialize metrics backend: {e}")
    metrics_backend = None


# API Routes
@app.get("/")
@limiter.limit(f"{settings.GENERAL_REQUESTS_PER_MINUTE}/minute")
async def root(request: Request):
    """Public root endpoint"""
    return {
        "message": "Metrics Simulator API",
        "version": "2.1.1",
        "status": "running",
        "env": settings.ENV,
        "apply_changes_limit": f"3 per 15 minutes"
    }


@app.get("/health")
@limiter.limit(f"{settings.GENERAL_REQUESTS_PER_MINUTE}/minute")
async def health_check(request: Request):
    """Health check endpoint"""
    health_status = {
        "status": "healthy",
        "timestamp": int(time.time()),
        "version": "2.1.1",
        "backend_healthy": metrics_backend is not None
    }

    if metrics_backend:
        try:
            backend_status = metrics_backend.get_status()
            health_status["prometheus_healthy"] = backend_status.get("healthy", False)
        except Exception as e:
            logger.error(f"Health check error: {e}")
            health_status["backend_healthy"] = False

    return health_status


@app.get("/api/status")
@limiter.limit(f"{settings.GENERAL_REQUESTS_PER_MINUTE}/minute")
async def api_status(request: Request):
    """API status with backend and rate limit info"""
    if not metrics_backend:
        raise HTTPException(status_code=503, detail="Metrics backend not initialized")

    try:
        status = metrics_backend.get_status()
        status.update({
            "api_version": "2.1.1",
            "environment": settings.ENV,
            "rate_limits": {
                "apply_changes": f"{settings.APPLY_CHANGES_PER_15MINUTES} per 15 minutes",
                "other_endpoints": f"{settings.GENERAL_REQUESTS_PER_MINUTE} per minute",
                "max_metrics_per_request": settings.MAX_METRICS_PER_REQUEST
            },
            "client_info": {
                "ip": get_remote_address(request) if settings.DEBUG else "hidden"
            }
        })
        return status
    except Exception as e:
        logger.error(f"Status check error: {e}")
        raise HTTPException(status_code=500, detail="Status check failed")


@app.get("/metrics")
@limiter.limit(f"{settings.GENERAL_REQUESTS_PER_MINUTE}/minute")
async def prometheus_metrics(request: Request):
    """Expose internal metrics (Prometheus format)"""
    if not metrics_backend:
        raise HTTPException(status_code=503, detail="Metrics backend not initialized")

    try:
        metrics_output = metrics_backend.get_metrics_output()
        return {"metrics": metrics_output, "format": "prometheus"}
    except Exception as e:
        logger.error(f"Metrics generation error: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate metrics")


# 🔒 MAIN ENDPOINT: Strictly Rate Limited
@app.post("/api/metrics/apply")
@limiter.limit(f"{settings.APPLY_CHANGES_PER_15MINUTES}/15minutes")
async def apply_metrics(request: Request, metrics_request: MetricsRequest):
    """
    🎯 APPLY CHANGES ENDPOINT
    Rate limited to 3 requests per 15 minutes per IP.
    """
    if not metrics_backend:
        raise HTTPException(status_code=503, detail="Metrics backend not initialized")

    client_ip = get_remote_address(request)
    user_agent = request.headers.get("User-Agent", "Unknown")

    logger.info(
        f"🎯 APPLY CHANGES REQUEST #{int(time.time())} - IP: {client_ip}, "
        f"Metrics: {len(metrics_request.metrics)}, "
        f"User-Agent: {user_agent[:50]}..."
    )

    try:
        metrics_data = {}
        for name, metric in metrics_request.metrics.items():
            metrics_data[name] = {
                "value": metric.value,
                "unit": metric.unit,
                "timestamp": metric.timestamp or int(time.time() * 1000)
            }

        success, message = metrics_backend.apply_metrics(
            metrics_data,
            timestamp=metrics_request.timestamp
        )

        if not success:
            logger.error(f"❌ Apply Changes FAILED from IP {client_ip}: {message}")
            raise HTTPException(status_code=400, detail=f"Failed to apply metrics: {message}")

        logger.info(f"✅ Apply Changes SUCCESSFUL from IP {client_ip} - {len(metrics_request.metrics)} metrics applied")

        return {
            "success": True,
            "message": message,
            "metrics_count": len(metrics_request.metrics),
            "timestamp": int(time.time()),
            "rate_limit_info": {
                "limit": f"{settings.APPLY_CHANGES_PER_15MINUTES} per 15 minutes",
                "window": "900 seconds",
                "tip": "Wait at least 5 minutes between applies to avoid hitting the limit"
            }
        }

    except ValueError as e:
        logger.warning(f"⚠️ Apply Changes validation error from IP {client_ip}: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"💥 Apply Changes unexpected error from IP {client_ip}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


# Debug endpoint (only in debug mode)
if settings.DEBUG:
    @app.get("/debug/config")
    @limiter.limit("30/minute")
    async def debug_config(request: Request):
        """Debug endpoint to show current configuration"""
        return {
            "apply_changes_limit": f"{settings.APPLY_CHANGES_PER_15MINUTES} per 15 minutes",
            "general_limit": f"{settings.GENERAL_REQUESTS_PER_MINUTE}/minute",
            "client_ip": get_remote_address(request),
            "env": settings.ENV,
            "debug": settings.DEBUG
        }


# Startup & Shutdown Events
@app.on_event("startup")
async def startup_event():
    logger.info("🚀 Starting Metrics Simulator API")
    logger.info(f"   Environment: {settings.ENV}")
    logger.info(f"   Debug Mode: {settings.DEBUG}")
    logger.info(f"   Prometheus Gateway: {settings.PROMETHEUS_GATEWAY_URL}")
    logger.info("   🔒 RATE LIMITING:")
    logger.info(f"     🎯 Apply Changes: {settings.APPLY_CHANGES_PER_15MINUTES}/15min")
    logger.info(f"     🔄 Other endpoints: {settings.GENERAL_REQUESTS_PER_MINUTE}/minute")
    logger.info(f"   💡 Tip: Wait 5+ minutes between Apply Changes")
    logger.info(f"   🔐 Authentication: DISABLED (Public API)")


@app.on_event("shutdown")
async def shutdown_event():
    logger.info("🛑 Shutting down Metrics Simulator API")


# Run with Uvicorn (for direct execution)
if __name__ == "__main__":
    import uvicorn

    print("=" * 70)
    print("🎯 METRICS SIMULATOR API - APPLY CHANGES RATE LIMITED")
    print("=" * 70)
    print(f"Environment: {settings.ENV}")
    print(f"Host: {settings.HOST}:{settings.PORT}")
    print("")
    print("🔒 RATE LIMITING:")
    print(f"  🎯 Apply Changes: {settings.APPLY_CHANGES_PER_15MINUTES} per 15 minutes")
    print(f"  🔄 Other endpoints: {settings.GENERAL_REQUESTS_PER_MINUTE}/minute")
    print("")
    print("💡 Tip: Wait at least 5 minutes between Apply Changes")
    print("=" * 70)

    uvicorn.run(
        app,
        host=settings.HOST,
        port=settings.PORT,
        access_log=settings.DEBUG,
        log_level="info" if settings.DEBUG else "warning"
    )