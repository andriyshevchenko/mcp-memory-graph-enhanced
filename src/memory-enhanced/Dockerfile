FROM node:22.12-alpine AS builder

COPY src/memory-enhanced /app
COPY tsconfig.json /tsconfig.json

WORKDIR /app

RUN --mount=type=cache,target=/root/.npm npm install

RUN npm run build

RUN --mount=type=cache,target=/root/.npm-production npm ci --ignore-scripts --omit-dev

FROM node:22.12-alpine AS release

COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/package.json /app/package.json

ENV NODE_ENV=production

# Environment variables for storage configuration
# Set these to use Neo4j storage, otherwise JSONL file storage will be used
# ENV NEO4J_URI=neo4j://localhost:7687
# ENV NEO4J_USERNAME=neo4j
# ENV NEO4J_PASSWORD=password
# ENV NEO4J_DATABASE=neo4j
# ENV MEMORY_DIR_PATH=/app/memory-data

WORKDIR /app

RUN npm install --omit=dev --ignore-scripts

ENTRYPOINT ["node", "dist/index.js"]
