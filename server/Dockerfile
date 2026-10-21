# Cloud Run image for the AI report proxy.
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY index.js ./
COPY lib ./lib
USER node
CMD ["node", "index.js"]
