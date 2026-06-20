# Container image for the "collect & build DWH" GitHub Action.
#
# Debian slim (glibc) is required: @duckdb/node-api ships prebuilt native
# bindings for linux-x64-glibc, so no build toolchain is needed. Alpine (musl)
# would not resolve those prebuilts.
#
# Two stages: compile TypeScript with the full toolchain, then ship only the
# emitted JS plus production dependencies (no tsx/astro/vitest in the runtime).

# @duckdb/node-api ships its native binding per-arch via optionalDependencies
# (linux-x64 / linux-arm64, both glibc). As a `Dockerfile` action the image is
# built on the runner, so it resolves the matching prebuilt for that arch — no
# platform pin needed here. (When pre-building a fixed-arch ghcr image instead,
# pass --platform at `docker build` time.) Debian slim = glibc; Alpine/musl
# would not resolve these prebuilts.
FROM node:24-slim AS build
WORKDIR /engine
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:24-slim
# Engine code lives at a fixed path; the runner mounts the consumer repo at
# GITHUB_WORKSPACE and the entrypoint cd's there (no WORKDIR dependence).
COPY package.json package-lock.json /engine/
RUN cd /engine && npm ci --omit=dev
COPY --from=build /engine/dist /engine/dist
COPY entrypoint.sh /engine/entrypoint.sh
RUN chmod +x /engine/entrypoint.sh
ENTRYPOINT ["/engine/entrypoint.sh"]
