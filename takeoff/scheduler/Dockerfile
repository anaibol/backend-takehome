FROM node:lts AS builder

COPY . .

RUN yarn install
RUN yarn build:docker

FROM node:lts

COPY --from=builder /dist/scheduler ./dist/scheduler
COPY --from=builder /dist/share ./dist/share
COPY --from=builder /node_modules ./node_modules

EXPOSE 3001
CMD [ "node", "./dist/scheduler/src/scheduler.js" ]
