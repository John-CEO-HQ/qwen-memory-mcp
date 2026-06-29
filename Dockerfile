# Qwen Memory MCP - production image (HTTP transport).
# Multi-stage: build TypeScript, then ship a slim runtime.

FROM node:22-slim AS build
WORKDIR /app
COPY package.json ./
# No lockfile is committed for the standalone module; install from manifest.
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist

# Default to the HTTP transport for cloud deployment.
ENV MCP_TRANSPORT=http
ENV PORT=8080
EXPOSE 8080

# Basic liveness probe against the health endpoint.
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
