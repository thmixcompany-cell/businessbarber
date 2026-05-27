FROM node:22-alpine

WORKDIR /app

COPY package.json ./
COPY server.mjs ./
COPY index.html admin.html public.html ./
COPY app.js admin.js public-booking.js styles.css ./
COPY assets ./assets
COPY data/db.json ./data/db.json
COPY scripts ./scripts
COPY tests ./tests
COPY *.md ./

ENV NODE_ENV=production
ENV PORT=4187

EXPOSE 4187

CMD ["node", "server.mjs"]
