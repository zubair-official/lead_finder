# The Playwright image already contains Chromium and its system libraries,
# which is most of the pain of running a browser in a container.
FROM mcr.microsoft.com/playwright:v1.47.0-jammy

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=5000 \
    HEADLESS=true

WORKDIR /app

# Dependencies first so a code change doesn't reinstall them.
COPY package*.json ./
# Browsers ship with the base image, so skip the postinstall download.
RUN npm ci --omit=dev --ignore-scripts

COPY src ./src
COPY public ./public
COPY server.js ./

RUN mkdir -p runs && chown -R pwuser:pwuser /app
USER pwuser

EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
