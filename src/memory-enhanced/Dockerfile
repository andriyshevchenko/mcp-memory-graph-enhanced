FROM node:22.12-alpine AS builder

COPY src/memory-enhanced /app
COPY tsconfig.json /tsconfig.json

WORKDIR /app

RUN --mount=type=cache,target=/root/.npm npm install

RUN npm run build

RUN --mount=type=cache,target=/root/.npm-production npm ci --ignore-scripts --omit-dev

FROM node:22-alpine AS release

COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/package.json /app/package.json

ENV NODE_ENV=production

WORKDIR /app

RUN npm install --omit=dev --ignore-scripts

ENTRYPOINT ["node", "dist/index.js"]
