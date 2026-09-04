FROM nginx:1.27-alpine

ARG NGINX_CONF=deploy/nginx/docker-fullstack.conf.template
ARG NGINX_TEMPLATE=true
ARG API_BASE_URL=""
ARG REQUIRE_LOGIN=false

COPY ${NGINX_CONF} /tmp/survivor-nginx.conf
COPY index.html /usr/share/nginx/html/index.html
COPY styles.css /usr/share/nginx/html/styles.css
COPY favicon.ico /usr/share/nginx/html/favicon.ico
COPY assets /usr/share/nginx/html/assets
COPY src /usr/share/nginx/html/src
COPY styles /usr/share/nginx/html/styles
COPY vendor /usr/share/nginx/html/vendor

RUN if [ "$NGINX_TEMPLATE" = "true" ]; then \
      mkdir -p /etc/nginx/templates && cp /tmp/survivor-nginx.conf /etc/nginx/templates/default.conf.template; \
    else \
      cp /tmp/survivor-nginx.conf /etc/nginx/conf.d/default.conf; \
    fi
RUN printf '{"apiBaseUrl":"%s","requireLogin":%s,"defaultNickname":"游客"}\n' "$API_BASE_URL" "$REQUIRE_LOGIN" > /usr/share/nginx/html/src/config/backend-config.json

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
