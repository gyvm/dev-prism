# Container image for the "collect & build DWH" GitHub Action.
#
# Debian slim (glibc) is required: @duckdb/node-api ships prebuilt native
# bindings for linux-x64-glibc, so no build toolchain is needed. Alpine (musl)
# would not resolve those prebuilts.
#
# Two stages: compile TypeScript with the full toolchain, then ship only the
# emitted JS plus production dependencies (no tsx/astro/vitest in the runtime).

# Pin amd64: the duckdb prebuilt is published per-arch via optionalDependencies,
# and GitHub-hosted runners are amd64. This also keeps local builds on Apple
# Silicon from silently skipping the linux-x64 binding.
FROM --platform=linux/amd64 node:24-slim AS build
WORKDIR /engine
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM --platform=linux/amd64 node:24-slim
# Engine code lives at a fixed path; the runner mounts the consumer repo at
# GITHUB_WORKSPACE and the entrypoint cd's there (no WORKDIR dependence).
COPY package.json package-lock.json /engine/
RUN cd /engine && npm ci --omit=dev
COPY --from=build /engine/dist /engine/dist
COPY entrypoint.sh /engine/entrypoint.sh
RUN chmod +x /engine/entrypoint.sh
ENTRYPOINT ["/engine/entrypoint.sh"]
