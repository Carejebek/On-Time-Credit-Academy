FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY src ./src
COPY public ./public
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
EXPOSE 3070
CMD ["node", "src/server.js"]
