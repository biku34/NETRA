# Frontend image — build context is the REPO ROOT (see docker-compose.yml).
FROM node:22-alpine AS build
WORKDIR /app

COPY src/frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY src/frontend/ ./
# NEXT_PUBLIC_* are inlined at build time; the browser runs on the host, so the
# backend is reachable at localhost:8000.
ENV NEXT_PUBLIC_API_BASE=http://localhost:8000/api
ENV NEXT_PUBLIC_MAP_STYLE=https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json
ENV NEXT_PUBLIC_DISTRICT_CENTER=23.21,72.645
ENV NEXT_PUBLIC_DISTRICT_ZOOM=11.4
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/next.config.js ./next.config.js

EXPOSE 3000
CMD ["npm", "start"]
