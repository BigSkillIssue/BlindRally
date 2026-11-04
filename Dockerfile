FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node package.json server.js rally.js track.json ./
COPY --chown=node:node public ./public
USER node
EXPOSE 8080
CMD ["node", "server.js"]
