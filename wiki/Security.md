# Birdseye Security Guide

## Rate Limiting
- **Apply Changes**: 3 requests per 15 minutes per IP
- **General Endpoints**: 300 requests per minute per IP
- Uses SlowAPI with in-memory storage

## Request Security
- Max request size: 1MB
- Input validation via Pydantic models
- Metric value range: -1e15 to 1e15
- Max 50 metrics per request

## CORS Protection
- Production: Explicit origin allowlist required via `ALLOWED_ORIGINS`
- Development: Localhost fallback
- No wildcard origins in production

## Headers
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- HSTS in production

## Authentication
- Public API (no authentication required)
- CAPTCHA verification for Apply Changes
- IP-based rate limiting

## SSL/TLS
- Let's Encrypt certificates via cert-manager
- Automatic HTTP to HTTPS redirect
- ClusterIssuer configuration in Helm

## Container Security
- Private GHCR registry with pull secrets
- Non-root containers
- Resource limits enforced
