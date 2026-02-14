# Deployment Guide

## Environment variables
- `APP_SECRET`: Strong random secret for HMAC signing.
- `PORT`: HTTP port (default `8000`).
- `SECURE_COOKIES=true`: enable cookie `Secure` flag behind HTTPS.

## Local run
```bash
python app/server.py
```

## Production recommendations
1. Run behind TLS proxy (Caddy, Nginx, or cloud load balancer).
2. Set `SECURE_COOKIES=true` in production.
3. Mount persistent volume for `app.db`.
4. Use process manager (systemd, supervisord, or container orchestration).

## Container example
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY . .
ENV PORT=8000 SECURE_COOKIES=true
EXPOSE 8000
CMD ["python", "app/server.py"]
```
