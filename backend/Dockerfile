FROM node:20-alpine AS frontend-builder

WORKDIR /site
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
ENV VITE_API_BASE_URL=/api
RUN npm run build
RUN npm run build:ssr

FROM node:20-alpine AS backend

WORKDIR /app

# Install dependencies
COPY backend/package*.json ./
RUN npm install --omit=dev

# Copy application files
COPY backend/ ./
COPY --from=frontend-builder /site/dist /frontend/dist
COPY --from=frontend-builder /site/node_modules/react /frontend/node_modules/react
COPY --from=frontend-builder /site/node_modules/react-dom /frontend/node_modules/react-dom
COPY --from=frontend-builder /site/node_modules/scheduler /frontend/node_modules/scheduler
COPY --from=frontend-builder /site/node_modules/loose-envify /frontend/node_modules/loose-envify
COPY --from=frontend-builder /site/node_modules/js-tokens /frontend/node_modules/js-tokens

EXPOSE 5000

CMD ["node", "server.js"]

