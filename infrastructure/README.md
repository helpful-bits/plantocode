# Infrastructure

All infrastructure management is consolidated under Ansible. This is the **ONLY** place for all infrastructure automation.

## System Overview

This Ansible setup automates the deployment of the Vibe Manager application and its underlying infrastructure. It follows a robust, two-layer architecture:

1. **Base Infrastructure (`site-base.yml`):** Provisions and hardens the server. This layer is application-agnostic and includes setting up PostgreSQL, Redis, UFW firewall, SSH hardening, and automated security updates.
2. **Application Deployment (`site-app.yml`):** Manages the Vibe Manager application specifically. This includes creating the database schema, running migrations, managing application secrets via Ansible Vault, and performing zero-downtime deployments of the Rust binary using a symlink strategy.

The entire configuration is idempotent, modular, and leverages Ansible Vault for all sensitive data, ensuring a secure and repeatable process for managing the infrastructure as code.

## Quick Start

### Complete Setup (Infrastructure + Application)
```bash
# Set up inventory
cp inventory/hosts.yml.example inventory/hosts.yml
# Edit inventory/hosts.yml with your server details

# Run complete setup
cd ansible
ansible-playbook -i inventory/hosts.yml site.yml
```

### Check Server Status
```bash
cd ansible
ansible-playbook -i inventory/hosts.yml site.yml --tags status
```

### Enable SSL/TLS
```bash
cd ansible
ansible-playbook -i inventory/hosts.yml site-base.yml --tags nginx,ssl \
  -e "ssl_domain=yourdomain.com" \
  -e "ssl_email=admin@yourdomain.com"
```

## Architecture: Separation of Concerns

The infrastructure is organized into two distinct layers:

### 1. Base Infrastructure (`site-base.yml`)
Generic server setup that is application-agnostic and reusable:
- SSH hardening and security
- Firewall configuration (UFW)
- PostgreSQL installation and base configuration
- Redis installation
- Fail2ban and automatic security updates
- Backup configurations

**Run:** `ansible-playbook -i inventory/hosts.yml site-base.yml`

### 2. Application Deployment (`site-app.yml`)
Vibe Manager specific setup and deployment:
- Application database and user creation
- Database migrations
- Application secrets management
- Binary deployment and service management
- Health checks and monitoring

**Run:** `ansible-playbook -i inventory/hosts.yml site-app.yml`

## Directory Structure

```
ansible/
├── inventory/              # Server inventory files
│   └── hosts.yml          # Server connection details
├── group_vars/            # Group-specific variables
│   ├── all/              # Variables for all hosts (contains secrets.yml)
│   └── hetzner/          # Hetzner server variables
├── playbooks/             # All playbooks
│   ├── base-infrastructure/   # Generic server setup
│   │   ├── server-hardening.yml
│   │   ├── postgresql-setup.yml
│   │   ├── redis-setup.yml
│   │   ├── security-updates.yml
│   │   └── nginx-ssl.yml
│   └── app-vibe-manager/      # Application-specific
│       ├── app-setup.yml      # Master app playbook
│       ├── database-migrations.yml
│       ├── rust-deploy.yml
│       └── maintenance.yml    # Application management tasks
├── site.yml               # Master playbook (runs both base and app)
├── site-base.yml         # Base infrastructure only
└── site-app.yml          # Application deployment only
```

## Server Information

- **Server**: Hetzner Dedicated (Server Auction #2759303)
- **IP**: YOUR_EU_SERVER_IP
- **OS**: Ubuntu 24.04 LTS
- **RAM**: 64GB
- **PostgreSQL**: 17 (configured for 16GB shared_buffers)
- **Redis**: 7 (configured for 4GB max memory)

## Common Operations

### Application Management
```bash
# Run database migrations
ansible-playbook -i inventory/hosts.yml site-app.yml --tags migrations

# Deploy new version
ansible-playbook -i inventory/hosts.yml site-app.yml --tags deploy

# Environment variables are managed with Ansible Vault
# See Ansible Vault section below for details

# Service control
ansible-playbook -i inventory/hosts.yml site-app.yml --tags restart
ansible-playbook -i inventory/hosts.yml site-app.yml --tags stop
ansible-playbook -i inventory/hosts.yml site-app.yml --tags start

# View logs
ansible-playbook -i inventory/hosts.yml site-app.yml --tags logs

# Check status
ansible-playbook -i inventory/hosts.yml site-app.yml --tags status
```

### Infrastructure Management
```bash
# Check infrastructure status
ansible-playbook -i inventory/hosts.yml site-base.yml --tags status

# Update security
ansible-playbook -i inventory/hosts.yml site-base.yml --tags security

# PostgreSQL operations
ansible-playbook -i inventory/hosts.yml site-base.yml --tags postgresql
ansible-playbook -i inventory/hosts.yml site-base.yml --tags backup
```

### Daily Operations
```bash
# Check server health
ansible-playbook -i inventory/hosts.yml site.yml --tags status

# Apply security updates
ansible-playbook -i inventory/hosts.yml site-base.yml --tags security-updates

# Run PostgreSQL backup manually
ansible -i inventory/hosts.yml hetzner -m command -a "/usr/local/bin/backup_postgresql.sh" --become
```

### Troubleshooting
```bash
# Test connection
ansible -i inventory/hosts.yml hetzner -m ping --vault-password-file .vault_pass

# Run ad-hoc commands
ansible -i inventory/hosts.yml hetzner -m command -a "df -h" --become --vault-password-file .vault_pass
ansible -i inventory/hosts.yml hetzner -m command -a "systemctl status postgresql@17-main" --become --vault-password-file .vault_pass

# Check logs
ansible -i inventory/hosts.yml hetzner -m command -a "tail -20 /var/log/postgresql/postgresql-17-main.log" --become --vault-password-file .vault_pass

# Common issues:
# - Service fails with "SERVER_AUTH0_CALLBACK_URL must be set" - Check app_env_vars in secrets.yml
# - "undefined variable" errors - Ensure you're running from the ansible directory
# - Service killed by watchdog - Update service Type to "simple" in rust-deploy.yml
# - Redis not found - Service is named "redis-server" not "redis"
```

## Security Notes

### PostgreSQL Security
- Configured to listen on `localhost` only
- All secrets (database, Redis, application) are managed exclusively through Ansible Vault
- The application connects using a dedicated user with permissions scoped via a role
- The `app.env` file containing the database connection string is generated on deploy and has restricted permissions (`0600`)

### SSH Security
- Key-only authentication (no passwords)
- Modern crypto algorithms only
- Fail2ban protecting against brute force

### Firewall Rules
- Default deny incoming
- Allowed ports: 22 (SSH), 80 (HTTP), 443 (HTTPS)
- PostgreSQL port 5432 is NOT open (localhost only)
- Redis port 6379 is NOT open (localhost only)

### SSL/TLS Security
- Let's Encrypt certificates with automatic renewal
- Modern TLS protocols only (TLS 1.2+)
- Strong cipher suites
- HSTS enabled
- Security headers configured
- OCSP stapling enabled

## Ansible Vault for Secret Management

All sensitive data is managed using Ansible Vault for security:

### Setup Vault Password
```bash
# Create vault password file (gitignored)
echo "your_vault_password" > .vault_pass
chmod 600 .vault_pass
```

### Create and Encrypt the Secrets File
```bash
# Copy the example file and edit with your values
cp group_vars/all/secrets.yml.example group_vars/all/secrets.yml
# Edit the file with your actual secrets
vim group_vars/all/secrets.yml

# Encrypt the secrets file
ansible-vault encrypt group_vars/all/secrets.yml --vault-password-file .vault_pass
```

### Managing Secrets
```bash
# Edit encrypted secrets
ansible-vault edit group_vars/all/secrets.yml --vault-password-file .vault_pass

# View encrypted secrets
ansible-vault view group_vars/all/secrets.yml --vault-password-file .vault_pass

# Run playbooks with vault
ansible-playbook -i inventory/hosts.yml site-app.yml --vault-password-file .vault_pass
```

### Application Environment Variables

The application environment is managed through a centralized `app_env_vars` section in the vault. This ensures:
- **Complete replacement** on each deploy (no stale variables)
- **Single source of truth** for all environment configuration
- **Templated values** that reference other vault variables

The `app_env_vars` dictionary in `secrets.yml` contains ALL environment variables that will be written to `/opt/vibe-manager/config/app.env`. The deployment process completely replaces this file, ensuring no outdated variables persist.

Example structure:
```yaml
app_env_vars:
  APP_NAME: "vibe-manager"
  DATABASE_URL: "postgresql://{{ db_user }}:{{ db_password }}@localhost:5432/{{ db_name }}"
  REDIS_URL: "redis://:{{ redis_password }}@127.0.0.1:6379"
  # ... all other environment variables
```

### Environment Targeting

Use the `--limit` flag to target specific environments:

```bash
# Target specific server/group
ansible-playbook -i inventory/hosts.yml site.yml --limit hetzner

# Target multiple servers
ansible-playbook -i inventory/hosts.yml site.yml --limit "hetzner,other_server"

# Target with patterns
ansible-playbook -i inventory/hosts.yml site.yml --limit "production*"
```

## Emergency Procedures

If locked out:
1. Use your cloud provider's KVM Console (e.g., Hetzner KVM Console)
2. Login with the root password provided by your cloud provider
3. Run `/root/disable_firewall.sh`
4. Fix issue and re-enable firewall

## File Locations on Server

### Base Infrastructure Files
- `/root/disable_firewall.sh` - Emergency firewall disable
- `/root/RECOVERY_PROCEDURES.txt` - Recovery instructions
- `/var/backups/postgresql/` - Database backups
- `/usr/local/bin/backup_postgresql.sh` - Backup script (uses pg_dumpall for full server backup)

### Application Files
- `/opt/vibe-manager/` - Application root
- `/opt/vibe-manager/bin/` - Binary location
- `/opt/vibe-manager/config/app.env` - Environment variables
- `/opt/vibe-manager/migrations/` - Database migrations
- `/opt/vibe-manager/logs/` - Application logs
- `/etc/systemd/system/vibe-manager.service` - Service file

## Extending the Infrastructure

To add new servers:
1. Edit `inventory/hosts.yml`
2. Add server details
3. Run playbook with `--limit new-server`

To add new features:
1. Decide if it's base infrastructure or app-specific
2. Add to appropriate playbook directory
3. Document the feature in this README
4. Test with `--check` first

## Important Lessons Learned

1. **NEVER** enable firewall before restarting SSH
2. Always test SSH config: `sshd -t`
3. Add SSH key BEFORE disabling password auth
4. Keep emergency scripts on server
5. Always have console access ready
6. **SEPARATE** base infrastructure from application deployment
7. Use `Type=simple` for systemd services unless they implement sd_notify
8. Redis service is named `redis-server` on Ubuntu (not `redis`)
9. Run playbooks from the ansible directory to ensure group_vars access
10. Use `app_env_vars` pattern for complete environment management
11. PostgreSQL module `postgresql_default_privs` doesn't exist - use `postgresql_privs` with `type: default_privs`

## Ansible Best Practices

1. Always use `--check` for dry runs
2. Use `--diff` to see changes
3. Use tags to run specific sections
4. Test on one server with `--limit`
5. Keep playbooks idempotent
6. Separate infrastructure from application concerns
7. Use Ansible Vault for all sensitive data

## Why Ansible?

- Self-documenting infrastructure as code
- Idempotent operations (safe to run multiple times)
- Version controlled configuration
- No manual scripts to maintain
- Built-in error handling and recovery

## Additional Documentation

- [RUST_DEPLOYMENT.md](./RUST_DEPLOYMENT.md) - Rust binary deployment guide