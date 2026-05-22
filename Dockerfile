# ─── Frontend build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS frontend

WORKDIR /frontend

COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY frontend/ ./
RUN npm run build

# ─── Backend build ────────────────────────────────────────────────────────────
FROM golang:1.22-alpine AS builder

RUN apk add --no-cache git ca-certificates tzdata

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -ldflags="-w -s" -o /app/bin/server ./cmd/server

# ─── Runtime stage ────────────────────────────────────────────────────────────
FROM alpine:3.19

RUN apk add --no-cache ca-certificates tzdata curl

WORKDIR /app

COPY --from=builder  /app/bin/server   .
COPY --from=builder  /app/migrations   ./migrations
COPY --from=frontend /frontend/dist    ./static

RUN mkdir -p /tmp/quizgen_uploads && chmod 777 /tmp/quizgen_uploads

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

ENTRYPOINT ["./server"]
