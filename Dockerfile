FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=5173
COPY --from=build --chown=node:node /app ./
RUN mkdir -p /app/.data /app/backups && chown node:node /app/.data /app/backups
USER node
EXPOSE 5173
CMD ["npm","start"]
