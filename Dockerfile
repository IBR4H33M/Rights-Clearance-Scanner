FROM node:24-slim AS build

RUN npm install -g pnpm@10.33.2

WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY lib/ lib/
COPY artifacts/ artifacts/
COPY scripts/ scripts/
COPY tsconfig.base.json tsconfig.json ./

RUN pnpm install --frozen-lockfile
RUN pnpm run build

FROM node:24-slim AS runtime

RUN apt-get update && apt-get install -y python3 python3-pip python3-venv && \
    python3 -m venv /opt/venv && \
    /opt/venv/bin/pip install mcp-clickhouse && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /app
COPY --from=build /app/artifacts/api-server/dist ./dist
COPY --from=build /app/artifacts/rights-clearance-scanner/dist/public ./dist/public
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./

EXPOSE 8080
ENV PORT=8080
ENV NODE_ENV=production

CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
