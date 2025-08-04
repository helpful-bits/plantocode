# Infrastructure

All infrastructure management is consolidated under Ansible.

## Quick Start

### Complete Setup (Infrastructure + Application)
```bash
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

## Documentation

- [ansible/README.md](./ansible/README.md) - Complete Ansible documentation
- [RUST_DEPLOYMENT.md](./RUST_DEPLOYMENT.md) - Rust binary deployment guide

## Why Ansible?

- Self-documenting infrastructure as code
- Idempotent operations (safe to run multiple times)
- Version controlled configuration
- No manual scripts to maintain
- Built-in error handling and recovery

All infrastructure operations are managed through Ansible playbooks.