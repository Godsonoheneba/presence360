FROM node:20-alpine

WORKDIR /app

ENV NPM_CONFIG_LOGLEVEL=error \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_UPDATE_NOTIFIER=false

COPY package.json ./
RUN npm install

COPY . ./

EXPOSE 3001

CMD ["npm", "run", "dev"]
