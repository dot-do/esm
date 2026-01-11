# Custom Nginx image for esm.do
# Based on official Nginx with Brotli compression support

FROM nginx:1.25-alpine AS builder

# Install build dependencies
RUN apk add --no-cache \
    git \
    gcc \
    libc-dev \
    make \
    openssl-dev \
    pcre-dev \
    zlib-dev \
    linux-headers \
    libxslt-dev \
    gd-dev \
    geoip-dev \
    brotli-dev

# Get nginx source
RUN wget "http://nginx.org/download/nginx-${NGINX_VERSION}.tar.gz" -O nginx.tar.gz && \
    tar -xzf nginx.tar.gz

# Clone ngx_brotli module
RUN git clone --recurse-submodules -j8 https://github.com/google/ngx_brotli.git /tmp/ngx_brotli

# Build nginx with brotli module
WORKDIR /nginx-${NGINX_VERSION}
RUN ./configure \
    --prefix=/etc/nginx \
    --sbin-path=/usr/sbin/nginx \
    --modules-path=/usr/lib/nginx/modules \
    --conf-path=/etc/nginx/nginx.conf \
    --error-log-path=/var/log/nginx/error.log \
    --http-log-path=/var/log/nginx/access.log \
    --pid-path=/var/run/nginx.pid \
    --lock-path=/var/run/nginx.lock \
    --with-compat \
    --with-file-aio \
    --with-threads \
    --with-http_addition_module \
    --with-http_auth_request_module \
    --with-http_dav_module \
    --with-http_flv_module \
    --with-http_gunzip_module \
    --with-http_gzip_static_module \
    --with-http_mp4_module \
    --with-http_random_index_module \
    --with-http_realip_module \
    --with-http_secure_link_module \
    --with-http_slice_module \
    --with-http_ssl_module \
    --with-http_stub_status_module \
    --with-http_sub_module \
    --with-http_v2_module \
    --with-stream \
    --with-stream_realip_module \
    --with-stream_ssl_module \
    --with-stream_ssl_preread_module \
    --add-dynamic-module=/tmp/ngx_brotli && \
    make modules

# Final image
FROM nginx:1.25-alpine

# Install runtime dependencies
RUN apk add --no-cache \
    brotli \
    openssl \
    curl \
    tzdata

# Copy brotli modules from builder
COPY --from=builder /nginx-*/objs/ngx_http_brotli_filter_module.so /usr/lib/nginx/modules/
COPY --from=builder /nginx-*/objs/ngx_http_brotli_static_module.so /usr/lib/nginx/modules/

# Create required directories
RUN mkdir -p \
    /var/cache/nginx/esm \
    /var/www/certbot \
    /etc/nginx/sites-available \
    /etc/nginx/sites-enabled \
    /etc/nginx/ssl \
    /etc/nginx/conf.d

# Create symlink for sites-enabled
RUN ln -sf /etc/nginx/sites-available/esm.do.conf /etc/nginx/sites-enabled/esm.do.conf

# Set proper permissions
RUN chown -R nginx:nginx /var/cache/nginx && \
    chmod -R 755 /var/cache/nginx

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost/health || exit 1

# Expose ports
EXPOSE 80 443

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
