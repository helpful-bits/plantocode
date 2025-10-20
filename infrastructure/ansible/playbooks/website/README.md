# PlanToCode Website Deployment Playbooks

## Current Deployment (USE THIS)

```bash
# Deploy everything (Docker + Nginx)
ansible-playbook deploy.yml -i inventory/hosts

# Deploy only Docker container
ansible-playbook deploy.yml -i inventory/hosts --tags docker

# Update only nginx configuration
ansible-playbook deploy.yml -i inventory/hosts --tags nginx

# Update environment variables only
ansible-playbook deploy.yml -i inventory/hosts --tags env
```

## Architecture

The consolidated `deploy.yml` playbook:
- **Modular design**: Tasks are split into reusable files in `tasks/`
- **Templates**: Configuration files use Jinja2 templates in `templates/`
- **Zero-downtime**: Staging container tested before production swap
- **Environment variables**: Loaded from Ansible vault secrets
- **Management scripts**: Generated for easy container management

## Directory Structure

```
website/
├── deploy.yml                 # Main playbook (USE THIS)
├── tasks/                     # Modular task files
│   ├── install-docker.yml
│   ├── sync-artifacts.yml
│   ├── deploy-container.yml
│   └── configure-nginx.yml
├── templates/                 # Jinja2 templates
│   ├── env.production.j2
│   ├── nginx-site.j2
│   ├── manage.sh.j2
│   └── logs.sh.j2
└── README.md                  # This file

# DEPRECATED - DO NOT USE
├── website-deploy.yml         # [DEPRECATED] Old simple deployment
├── website-docker-deploy.yml  # [DEPRECATED] Old docker deployment
└── website-nginx-deploy.yml   # [DEPRECATED] Old nginx deployment
```

## Prerequisites

1. Build the website locally first:
   ```bash
   cd website/
   ./build-and-deploy.sh
   ```

2. Configure secrets in `group_vars/[region]/secrets.yml`:
   ```yaml
   website_env_vars:
     NEXT_PUBLIC_PLAUSIBLE_DOMAIN: "yourdomain.com"
     PLAUSIBLE_DEBUG: "false"
     # ... other environment variables
   ```

## Post-Deployment

After deployment, use the management script on the server:

```bash
# On the server
cd /opt/plantocode-website
./manage.sh status   # Check status
./manage.sh logs     # View logs
./manage.sh restart  # Restart container
./manage.sh env      # Check environment variables
```

## Migration from Old Playbooks

If you were using the old playbooks, simply switch to `deploy.yml`:
- `website-deploy.yml` → `deploy.yml`
- `website-docker-deploy.yml` → `deploy.yml`
- `website-nginx-deploy.yml` → `deploy.yml --tags nginx`

The old files are kept for reference but should NOT be used.