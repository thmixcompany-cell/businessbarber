FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.mjs ./
COPY index.html app.html admin.html public.html privacidade.html termos.html cadastro.html sucesso.html onboarding.html ./
COPY app.js admin.js public-booking.js cadastro.js sucesso.js styles.css ./
COPY assets ./assets
RUN mkdir -p ./data && echo '{}' > ./data/db.json
COPY *.md ./

ENV NODE_ENV=production
ENV PORT=4187

EXPOSE 4187
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://localhost:4187/api/health || exit 1

CMD ["node", "server.mjs"]
