# Ansible Infrastructure Management

This is the **ONLY** place for all infrastructure automation. All scripts, documentation, and procedures are consolidated here.

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
│       └── rust-deploy.yml
├── site.yml               # Master playbook (runs both base and app)
├── site-base.yml         # Base infrastructure only
└── site-app.yml          # Application deployment only
```

## Quick Start

### Complete Setup (Infrastructure + Application)
```bash
# Set up inventory
cp inventory/hosts.yml.example inventory/hosts.yml
# Edit inventory/hosts.yml with your server details

# Run complete setup
ansible-playbook -i inventory/hosts.yml site.yml
```

### Base Infrastructure Only
```bash
# Install PostgreSQL, Redis, security hardening
ansible-playbook -i inventory/hosts.yml site-base.yml

# Add SSL support (requires domain name)
ansible-playbook -i inventory/hosts.yml site-base.yml --tags nginx,ssl \
  -e "ssl_domain=yourdomain.com" \
  -e "ssl_email=admin@yourdomain.com"
```

### Application Deployment Only
```bash
# Deploy Vibe Manager (requires base infrastructure)
ansible-playbook -i inventory/hosts.yml site-app.yml
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
ansible -i inventory/hosts.yml hetzner -m ping

# Run ad-hoc commands
ansible -i inventory/hosts.yml hetzner -m command -a "df -h" --become
ansible -i inventory/hosts.yml hetzner -m command -a "systemctl status postgresql@17-main" --become

# Check logs
ansible -i inventory/hosts.yml hetzner -m command -a "tail -20 /var/log/postgresql/postgresql-17-main.log" --become
```

## Security Notes

### PostgreSQL Security
- Configured to listen on `localhost` only
- No external connections allowed by default
- Strong 60+ character passwords in `/root/.postgresql_passwords`
- Connection logging enabled
- Application uses dedicated user and role

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

## Emergency Procedures

If locked out:
1. Use Hetzner KVM Console
2. Login with root password from `/root/.postgresql_passwords`
3. Run `/root/disable_firewall.sh`
4. Fix issue and re-enable firewall

## Important Lessons Learned

1. **NEVER** enable firewall before restarting SSH
2. Always test SSH config: `sshd -t`
3. Add SSH key BEFORE disabling password auth
4. Keep emergency scripts on server
5. Always have console access ready
6. **SEPARATE** base infrastructure from application deployment

## File Locations on Server

### Base Infrastructure Files
- `/root/.postgresql_passwords` - All passwords
- `/root/disable_firewall.sh` - Emergency firewall disable
- `/root/RECOVERY_PROCEDURES.txt` - Recovery instructions
- `/var/backups/postgresql/` - Database backups
- `/usr/local/bin/backup_postgresql.sh` - Backup script

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

## Ansible Vault for Secret Management

All sensitive data is managed using Ansible Vault for security:

### Setup Vault Password
```bash
# Create vault password file (gitignored)
echo "your_vault_password" > .vault_pass
chmod 600 .vault_pass
```

### Encrypt the Secrets File
```bash
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

## Ansible Best Practices

1. Always use `--check` for dry runs
2. Use `--diff` to see changes
3. Use tags to run specific sections
4. Test on one server with `--limit`
5. Keep playbooks idempotent
6. Separate infrastructure from application concerns
7. Use Ansible Vault for all sensitive data

