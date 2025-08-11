# Infrastructure Operations Guide

## Quick Command Reference

### Redis Operations

#### Flush Redis Cache
```bash
# Flush all Redis databases on US server
cd infrastructure/ansible
ansible interserver-us -i inventory/hosts.yml -m shell -a "redis-cli -a '{{ redis_password }}' FLUSHALL" --vault-password-file .vault_pass -e @group_vars/interserver/secrets.yml

# Flush all Redis databases on EU server
ansible hetzner-primary -i inventory/hosts.yml -m shell -a "redis-cli -a '{{ redis_password }}' FLUSHALL" --vault-password-file .vault_pass -e @group_vars/hetzner/secrets.yml
```

#### Check Redis Status
```bash
# Check database size
ansible interserver-us -i inventory/hosts.yml -m shell -a "redis-cli -a '{{ redis_password }}' DBSIZE" --vault-password-file .vault_pass -e @group_vars/interserver/secrets.yml

# Check Redis info
ansible interserver-us -i inventory/hosts.yml -m shell -a "redis-cli -a '{{ redis_password }}' INFO" --vault-password-file .vault_pass -e @group_vars/interserver/secrets.yml

# Check specific keyspace
ansible interserver-us -i inventory/hosts.yml -m shell -a "redis-cli -a '{{ redis_password }}' INFO keyspace" --vault-password-file .vault_pass -e @group_vars/interserver/secrets.yml
```

### PostgreSQL Operations

#### Run SQL Commands
```bash
# Execute SQL on US server
ansible interserver-us -i inventory/hosts.yml -m shell -a "PGPASSWORD='{{ db_password }}' psql -U {{ db_user }} -d {{ db_name }} -c 'SELECT COUNT(*) FROM users;'" --vault-password-file .vault_pass -e @group_vars/interserver/secrets.yml

# Check database connections
ansible interserver-us -i inventory/hosts.yml -m shell -a "PGPASSWORD='{{ db_password }}' psql -U {{ db_user }} -d {{ db_name }} -c 'SELECT count(*) FROM pg_stat_activity;'" --vault-password-file .vault_pass -e @group_vars/interserver/secrets.yml
```

### Application Operations

#### Service Management
```bash
# Restart application
ansible interserver-us -i inventory/hosts.yml -m systemd -a "name=vibe-manager state=restarted" --become

# Check service status
ansible interserver-us -i inventory/hosts.yml -m systemd -a "name=vibe-manager" --become

# View application logs
ansible interserver-us -i inventory/hosts.yml -m shell -a "journalctl -u vibe-manager -n 100 --no-pager" --become
```

#### Health Checks
```bash
# Check application health endpoint
ansible interserver-us -i inventory/hosts.yml -m uri -a "url=http://127.0.0.1:8080/health"

# Check if port is listening
ansible interserver-us -i inventory/hosts.yml -m shell -a "netstat -tlnp | grep 8080" --become
```

### System Operations

#### Disk Space
```bash
# Check disk usage
ansible interserver-us -i inventory/hosts.yml -m shell -a "df -h"

# Check specific directory size
ansible interserver-us -i inventory/hosts.yml -m shell -a "du -sh /var/lib/postgresql"
```

#### Memory and CPU
```bash
# Check memory usage
ansible interserver-us -i inventory/hosts.yml -m shell -a "free -h"

# Check CPU load
ansible interserver-us -i inventory/hosts.yml -m shell -a "uptime"

# Check top processes
ansible interserver-us -i inventory/hosts.yml -m shell -a "top -b -n 1 | head -20"
```

## Important Notes

### Vault Password
- The vault password file is located at: `infrastructure/ansible/.vault_pass`
- Always use `--vault-password-file .vault_pass` when running commands that need secrets
- For server-specific secrets, include the appropriate group_vars file:
  - US server: `-e @group_vars/interserver/secrets.yml`
  - EU server: `-e @group_vars/hetzner/secrets.yml`

### Server Targets
- **US Server**: `interserver-us` (173.214.173.78)
- **EU Server**: `hetzner-primary` (65.108.202.251)
- **All servers**: `all`

### Common Patterns

#### Ad-hoc Command Structure
```bash
ansible <target> -i inventory/hosts.yml -m <module> -a "<command>" [--become] [--vault-password-file .vault_pass] [-e @group_vars/<server>/secrets.yml]
```

#### Using Shell Module with Secrets
```bash
# Pattern for commands that need passwords from vault
ansible <target> -i inventory/hosts.yml -m shell -a "<command with {{ variable }}>" --vault-password-file .vault_pass -e @group_vars/<server>/secrets.yml
```

#### Direct SSH Alternative
```bash
# If ansible is not available, use direct SSH
ssh root@173.214.173.78 -i ~/.ssh/id_ed25519_interserver "<command>"
ssh root@65.108.202.251 -i ~/.ssh/id_ed25519_hetzner "<command>"
```

## Safety Tips

1. **Always verify the target server** before running destructive commands
2. **Use `--check` flag** for dry runs when available
3. **Check current state** before making changes (e.g., DBSIZE before FLUSHALL)
4. **Keep logs** of operations performed for audit purposes
5. **Test on staging/dev** environment first when possible

## Troubleshooting

### Common Issues

#### Vault Password Error
```bash
ERROR! Attempting to decrypt but no vault secrets found
```
**Solution**: Add `--vault-password-file .vault_pass` and appropriate `-e @group_vars/...`

#### Permission Denied
```bash
Permission denied
```
**Solution**: Add `--become` flag for sudo operations

#### Module Not Found
```bash
ERROR! couldn't resolve module/action 'xyz'
```
**Solution**: Check module name or use `shell` module as fallback

#### SSH Connection Failed
```bash
Failed to connect to the host via ssh
```
**Solution**: 
- Check SSH key exists: `~/.ssh/id_ed25519_interserver` or `~/.ssh/id_ed25519_hetzner`
- Verify server IP in `inventory/hosts.yml`
- Test direct SSH connection first