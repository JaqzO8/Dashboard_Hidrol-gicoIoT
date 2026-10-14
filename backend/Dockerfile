FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
RUN npm ci --omit=dev --workspace backend
COPY backend/src ./backend/src
RUN mkdir -p /app/backend/data && chown -R node:node /app
USER node
WORKDIR /app/backend
ENV HOST=0.0.0.0 PORT=8787
EXPOSE 8787
HEALTHCHECK --interval=30s CMD node -e "fetch('http://127.0.0.1:8787/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]
