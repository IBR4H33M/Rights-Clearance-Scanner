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

RUN npm install -g pnpm@10.33.2

WORKDIR /app

# Copy workspace configuration and all package.json files
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY lib/ lib/
COPY artifacts/api-server/package.json artifacts/api-server/
COPY artifacts/rights-clearance-scanner/package.json artifacts/rights-clearance-scanner/
COPY scripts/package.json scripts/

# Install all production dependencies
RUN pnpm install --prod --frozen-lockfile

# Copy built dist files
COPY --from=build /app/artifacts/api-server/dist ./artifacts/api-server/dist
COPY --from=build /app/artifacts/rights-clearance-scanner/dist ./artifacts/rights-clearance-scanner/dist
COPY --from=build /app/artifacts/rights-clearance-scanner/dist/public ./artifacts/api-server/dist/public

EXPOSE 8080
ENV PORT=8080
ENV NODE_ENV=production

CMD ["node", "--enable-source-maps", "./artifacts/api-server/dist/index.mjs"]
