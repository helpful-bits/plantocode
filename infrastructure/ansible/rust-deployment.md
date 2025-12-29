# Rust Binary Deployment Guide

This guide explains how to build and deploy the PlanToCode Rust binary to the Ubuntu server.

## Prerequisites

1. **Install Cross-Compilation Tool**:
   ```bash
   cargo install cross
   ```

2. **Ensure Docker is Running** (required by cross):
   ```bash
   docker --version
   ```

## Building the Binary

### Cross-Compilation for Ubuntu
```bash
cd server
cross build --release --target x86_64-unknown-linux-gnu
```

The binary will be at: `target/x86_64-unknown-linux-gnu/release/server`

### Build Configuration

Add to your `Cargo.toml` for optimized builds:
```toml
[profile.release]
strip = true
opt-level = 3
lto = true
codegen-units = 1
```

## Deployment

All deployment is managed through Ansible with blue-green zero-downtime deployment.

### First Time Setup
```bash
# Run complete application setup (database, migrations, deployment)
cd infrastructure/ansible
ansible-playbook -i inventory/hosts.yml -i inventory/local.yml site-app.yml --vault-password-file .vault_pass

# Setup blue-green infrastructure (run once)
ansible-playbook -i inventory/hosts.yml -i inventory/local.yml playbooks/plantocode/rust-deploy.yml --tags bluegreen --vault-password-file .vault_pass
```

### Deploy New Version (Zero-Downtime)
```bash
# Build locally
cd server
cross build --release --target x86_64-unknown-linux-gnu

# Deploy with zero downtime (recommended)
cd ../infrastructure/ansible
ansible-playbook -i inventory/hosts.yml -i inventory/local.yml playbooks/plantocode/rust-deploy.yml --tags deploy-zerodowntime --vault-password-file .vault_pass
```

The zero-downtime deployment:
1. Starts the new version on the alternate port (blue/green)
2. Health checks the new instance
3. Gradually migrates traffic (99% new, 1% old)
4. Waits for old connections to drain
5. Stops the old instance

### Legacy Deploy (causes brief downtime)
```bash
# Only use if blue-green is not set up
ansible-playbook -i inventory/hosts.yml -i inventory/local.yml playbooks/plantocode/rust-deploy.yml --tags deploy --vault-password-file .vault_pass
```

### Rollback if Needed
```bash
ansible-playbook -i inventory/hosts.yml -i inventory/local.yml playbooks/plantocode/rust-deploy.yml --tags rollback --vault-password-file .vault_pass
```

**Warning:** This is a potentially dangerous operation. The 'rollback' tag is intentionally marked with 'never' in the playbook to prevent accidental execution. You must explicitly use '--tags rollback' to run it.

## Environment Variables

Environment variables are managed using Ansible Vault and deployed as `/opt/plantocode/config/app.env` on the server:

```bash
# Variables are automatically deployed during app setup
# Edit secrets with: ansible-vault edit group_vars/all/secrets.yml --vault-password-file .vault_pass
# Deploy with: ansible-playbook -i inventory/hosts.yml site-app.yml --vault-password-file .vault_pass
```

## Service Management

### Check Service Status
```bash
ansible-playbook -i inventory/hosts.yml site-app.yml --tags status
```

### View Logs
```bash
ansible-playbook -i inventory/hosts.yml site-app.yml --tags logs
```

### Restart Service
```bash
ansible-playbook -i inventory/hosts.yml site-app.yml --tags restart
```

### Check All Releases
```bash
ansible -i inventory/hosts.yml hetzner -m command -a "ls -la /opt/plantocode/releases/" --become
```

## Troubleshooting

### Binary Won't Start
```bash
# Check permissions
ansible -i inventory/hosts.yml hetzner -m command -a "ls -la /opt/plantocode/bin/" --become

# Check service logs using the playbook
ansible-playbook -i inventory/hosts.yml site-app.yml --tags logs
```

### Cross-Compilation Issues
```bash
# Use verbose output
cross build --release --target x86_64-unknown-linux-gnu -v

# Or use native compilation on Linux/WSL
cargo build --release --target x86_64-unknown-linux-gnu
```

### Database Connection Issues
- Ensure PostgreSQL is running
- Check DATABASE_URL in `/opt/plantocode/config/app.env`
- Run migrations: `ansible-playbook -i inventory/hosts.yml site-app.yml --tags migrations`

## Security Notes

- Binary runs as non-root user `plantocode`
- Systemd hardening enabled (PrivateTmp, ProtectSystem, etc.)
- Only localhost connections by default
- Use Nginx for SSL termination in production