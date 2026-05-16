FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    fontconfig \
    fonts-dejavu-core \
    fonts-dejavu-extra \
    fonts-noto-core \
    fonts-noto-color-emoji \
  && fc-cache -f -v \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev

COPY . .

ENV EXPORT_SVG_FONT_FAMILY="Noto Sans, DejaVu Sans, Arial, Helvetica, sans-serif"

EXPOSE 3000

CMD ["node", "server.js"]