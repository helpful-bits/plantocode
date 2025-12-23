# Deployment Token Setup

The PlanToCode zero-downtime deployment system uses an API token to authenticate with the `/health/deployment` endpoint. This endpoint exposes sensitive metrics (active requests, streams) that should not be publicly accessible.

## Initial Setup

1. **Generate a secure token:**
   ```bash
   openssl rand -hex 32
   ```

2. **Edit the vault file:**
   ```bash
   ansible-vault edit group_vars/all/vault_deployment.yml
   ```

   Replace `REPLACE_WITH_OUTPUT_OF_openssl_rand_hex_32` with your generated token.

3. **Encrypt the vault file (if not already encrypted):**
   ```bash
   ansible-vault encrypt group_vars/all/vault_deployment.yml
   ```

## Deployment

The token is deployed in three places:

1. **Systemd service files** (`plantocode-blue.service`, `plantocode-green.service`):
   - Set as `PLANTOCODE_DEPLOYMENT_TOKEN` environment variable
   - The Rust application reads this to authenticate requests

2. **Deployment config file** (`/opt/plantocode/config/deployment.env`):
   - Used by the zero-downtime deployment script
   - Contains `PLANTOCODE_DEPLOYMENT_TOKEN=<token>`

3. **Application environment** (via systemd):
   - Available to the running application for request validation

## Running Playbooks

When running playbooks that use the vault:

```bash
# With password prompt
ansible-playbook -i inventory/hosts.yml playbooks/plantocode/rust-deploy.yml --tags bluegreen --ask-vault-pass

# With password file
ansible-playbook -i inventory/hosts.yml playbooks/plantocode/rust-deploy.yml --tags bluegreen --vault-password-file .vault_pass
```

## Security Notes

- **NEVER** commit the unencrypted `vault_deployment.yml` file
- **NEVER** hardcode the token in source code
- The token should be long and random (at least 32 bytes)
- Rotate the token periodically
- The `/health` endpoint remains public but no longer exposes metrics
- The `/health/deployment` endpoint requires the token and exposes full metrics

## Testing

After deployment, test the endpoints:

```bash
# Public health check (no metrics)
curl http://localhost:8080/health

# Authenticated deployment status (with metrics)
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:8080/health/deployment

# Deployment script will use the token automatically
plantocode-zero-downtime deploy /path/to/binary
```