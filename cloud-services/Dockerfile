FROM node:20-slim

RUN apt-get update && apt-get install -y python3 python3-pip tzdata \
    && rm -rf /var/lib/apt/lists/*
RUN pip3 install --break-system-packages --no-cache-dir paddlepaddle paddleocr

RUN cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime \
    && echo "Asia/Shanghai" > /etc/timezone
ENV TZ=Asia/Shanghai

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production
COPY . .

ENV PYTHONUNBUFFERED=1

CMD ["node", "index.js"]
