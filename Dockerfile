FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends libimage-exiftool-perl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --chown=node:node app.js server.js db.js ./
COPY --chown=node:node src ./src
COPY --chown=node:node migrations ./migrations
COPY --chown=node:node scripts ./scripts
RUN mkdir /app/private-uploads && chown node:node /app/private-uploads
USER node
EXPOSE 3000
CMD ["node", "server.js"]
