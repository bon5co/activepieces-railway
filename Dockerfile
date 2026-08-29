# Railway-ready Activepieces.
#
# Upstream ships no way to create the first administrator: sign-up is open to
# anyone until the first account exists, and that account becomes the platform
# ADMIN. On a public Railway URL that means the first stranger to load the page
# owns the instance, and the deployer is then permanently locked out
# (403 INVITATION_ONLY_SIGN_UP) with no password-reset route in the community
# edition and no SMTP on a fresh deploy.
#
# This wrapper seeds the administrator from AP_ADMIN_EMAIL / AP_ADMIN_PASSWORD
# before the public port is ever opened, refuses to boot without a credential,
# and re-applies the credential on every boot so a redeploy is a working reset.
FROM activepieces/activepieces:0.82.0

USER root

# Baked literals. A template variable whose default is a literal is dropped by
# templateGenerate and publishes as a blank required field, so everything that
# is not genuinely the deployer's decision lives here instead.
ENV AP_ENVIRONMENT=prod \
    AP_EXECUTION_MODE=UNSANDBOXED \
    AP_SIGN_UP_ENABLED=false \
    AP_TELEMETRY_ENABLED=false \
    AP_TEMPLATES_SOURCE_URL=https://cloud.activepieces.com/api/v1/flow-templates \
    AP_FLOW_WORKER_CONCURRENCY=10 \
    AP_TRIGGER_DEFAULT_POLL_INTERVAL=5 \
    AP_WEBHOOK_TIMEOUT_SECONDS=30 \
    AP_SANDBOX_RUN_TIME_SECONDS=600 \
    AP_SEED_PORT=13000 \
    AP_POSTGRES_PORT=5432 \
    AP_POSTGRES_USERNAME=postgres \
    AP_POSTGRES_DATABASE=postgres \
    AP_POSTGRES_USE_SSL=false

COPY ap-admin.cjs /usr/local/bin/ap-admin.cjs
COPY railway-entrypoint.sh /usr/local/bin/railway-entrypoint.sh
RUN chmod +x /usr/local/bin/railway-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/railway-entrypoint.sh"]
