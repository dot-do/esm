# SSL Certificate Setup for esm.do

This guide covers SSL/TLS certificate setup for the esm.do Nginx reverse proxy.

## Certificate Files Required

Place the following files in this directory:

```
ssl/
├── esm.do.crt          # Full certificate chain (server + intermediate)
├── esm.do.key          # Private key
└── esm.do.chain.crt    # Intermediate certificates (for OCSP stapling)
```

## Option 1: Let's Encrypt (Recommended for Production)

### Initial Setup

1. Start nginx without SSL first:

```bash
# Comment out SSL lines in esm.do.conf temporarily
docker-compose up -d nginx
```

2. Run certbot to obtain certificates:

```bash
docker-compose run --rm certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    -d esm.do \
    -d "*.esm.do" \
    --email admin@esm.do \
    --agree-tos \
    --no-eff-email
```

3. Link certificates:

```bash
ln -sf /etc/letsencrypt/live/esm.do/fullchain.pem ssl/esm.do.crt
ln -sf /etc/letsencrypt/live/esm.do/privkey.pem ssl/esm.do.key
ln -sf /etc/letsencrypt/live/esm.do/chain.pem ssl/esm.do.chain.crt
```

4. Uncomment SSL lines and restart:

```bash
docker-compose up -d --force-recreate nginx
```

### Automatic Renewal

The certbot container automatically renews certificates. For manual renewal:

```bash
docker-compose --profile ssl up certbot
```

Or run renewal directly:

```bash
docker-compose exec certbot certbot renew
docker-compose exec nginx nginx -s reload
```

### Cron Job for Renewal

Add to crontab:

```bash
0 0 1,15 * * cd /path/to/esm/deploy/nginx && docker-compose exec certbot certbot renew --quiet && docker-compose exec nginx nginx -s reload
```

## Option 2: Self-Signed Certificates (Development)

Generate self-signed certificates for development:

```bash
# Generate private key
openssl genrsa -out esm.do.key 4096

# Generate certificate signing request
openssl req -new -key esm.do.key -out esm.do.csr \
    -subj "/CN=esm.do/O=ESM.do/C=US"

# Generate self-signed certificate (valid for 365 days)
openssl x509 -req -days 365 -in esm.do.csr \
    -signkey esm.do.key -out esm.do.crt

# Create chain file (same as cert for self-signed)
cp esm.do.crt esm.do.chain.crt

# Clean up CSR
rm esm.do.csr

# Set permissions
chmod 600 esm.do.key
chmod 644 esm.do.crt esm.do.chain.crt
```

### Development with Wildcard

For wildcard development certificates:

```bash
# Create config file for SAN
cat > openssl.cnf << 'EOF'
[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no

[req_distinguished_name]
CN = esm.do

[v3_req]
keyUsage = keyEncipherment, dataEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = esm.do
DNS.2 = *.esm.do
DNS.3 = localhost
EOF

# Generate with SAN
openssl req -x509 -nodes -days 365 -newkey rsa:4096 \
    -keyout esm.do.key -out esm.do.crt \
    -config openssl.cnf -extensions v3_req

cp esm.do.crt esm.do.chain.crt
rm openssl.cnf
```

## Option 3: Commercial SSL Certificate

For production with a commercial certificate:

1. Generate CSR:

```bash
openssl req -new -newkey rsa:4096 -nodes \
    -keyout esm.do.key -out esm.do.csr \
    -subj "/CN=esm.do/O=Your Organization/L=City/ST=State/C=US"
```

2. Submit CSR to your CA (DigiCert, Comodo, etc.)

3. Download and combine certificates:

```bash
# Usually provided as: server.crt, intermediate.crt, root.crt
cat server.crt intermediate.crt > esm.do.crt
cat intermediate.crt root.crt > esm.do.chain.crt
```

4. Set permissions:

```bash
chmod 600 esm.do.key
chmod 644 esm.do.crt esm.do.chain.crt
```

## Verification

### Check Certificate

```bash
# View certificate details
openssl x509 -in esm.do.crt -text -noout

# Check certificate dates
openssl x509 -in esm.do.crt -dates -noout

# Verify chain
openssl verify -CAfile esm.do.chain.crt esm.do.crt
```

### Test SSL Configuration

```bash
# Test with OpenSSL
openssl s_client -connect esm.do:443 -servername esm.do

# Check with curl
curl -vI https://esm.do/health

# SSL Labs test (for production)
# https://www.ssllabs.com/ssltest/analyze.html?d=esm.do
```

### Nginx SSL Test

```bash
# Validate nginx configuration
docker-compose exec nginx nginx -t

# Reload nginx after certificate changes
docker-compose exec nginx nginx -s reload
```

## Security Best Practices

1. **Key Permissions**: Always set `chmod 600` on private keys
2. **Key Backup**: Securely backup private keys
3. **Expiration Alerts**: Set up monitoring for certificate expiration
4. **HSTS**: Enable HSTS only after confirming SSL works
5. **CAA Records**: Add CAA DNS records to restrict certificate issuance:
   ```
   esm.do.  CAA  0 issue "letsencrypt.org"
   esm.do.  CAA  0 issuewild "letsencrypt.org"
   ```

## Troubleshooting

### Certificate Chain Issues

```bash
# Check if chain is complete
openssl s_client -connect esm.do:443 -showcerts

# Verify intermediate certificates
openssl verify -verbose -CAfile esm.do.chain.crt esm.do.crt
```

### Permission Denied

```bash
# Fix permissions
chown root:root esm.do.key esm.do.crt
chmod 600 esm.do.key
chmod 644 esm.do.crt
```

### Certificate/Key Mismatch

```bash
# Compare modulus
openssl x509 -noout -modulus -in esm.do.crt | openssl md5
openssl rsa -noout -modulus -in esm.do.key | openssl md5
# Both should output the same hash
```
