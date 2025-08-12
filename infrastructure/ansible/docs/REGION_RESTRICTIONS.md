# Region Restriction Implementation Guide

## Overview

This document describes the comprehensive region restriction system implemented for Vibe Manager to ensure compliance with territorial restrictions as outlined in the Terms of Service. The service is only available in:

- **European Union / European Economic Area** (30 countries)
- **United Kingdom**
- **United States** (excluding territories)

## Architecture

The region restriction system operates at multiple layers:

### 1. Network Layer (Nginx)
- **GeoIP Database**: Uses MaxMind GeoLite2 databases for IP geolocation
- **IP-based blocking**: Immediate rejection of requests from non-approved or sanctioned countries
- **Custom error pages**: Clear messaging for blocked users (451 for sanctions, 403 for regions)

### 2. Application Layer
- **Environment variables**: `ENFORCE_REGION_RESTRICTIONS=true`
- **Database tracking**: Consent events include region information
- **Audit logging**: All access attempts are logged for compliance

### 3. Monitoring Layer
- **Real-time alerts**: Suspicious patterns trigger immediate notifications
- **Fail2ban integration**: Automatic IP banning for repeat violators
- **Prometheus metrics**: Export metrics for dashboard visualization

## Implementation Components

### Playbooks

1. **region-restrictions.yml**
   - Installs GeoIP dependencies
   - Configures Nginx with country-based access control
   - Creates custom error pages
   - Sets up IP range blocking for occupied territories

2. **region-monitoring.yml**
   - Creates monitoring scripts
   - Sets up systemd timers for regular checks
   - Configures fail2ban rules
   - Exports Prometheus metrics

### Configuration Files

#### Nginx Configuration (`/etc/nginx/conf.d/geoip.conf`)
```nginx
map $geoip_country_code $allowed_country {
    default 0;
    # EU/EEA Countries
    AT 1;  # Austria
    BE 1;  # Belgium
    # ... (all approved countries)
    US 1;  # United States
}

map $geoip_country_code $sanctioned_country {
    default 0;
    CU 1;  # Cuba
    IR 1;  # Iran
    # ... (all sanctioned countries)
}
```

#### Environment Variables (`/opt/vibe-manager/.env`)
```bash
ENFORCE_REGION_RESTRICTIONS=true
ALLOWED_REGIONS=EU,UK,US
GEOIP_DATABASE_PATH=/usr/share/GeoIP
LOG_BLOCKED_ACCESS=true
```

## Blocked Countries

### OFAC Sanctioned Countries
- Cuba (CU)
- Iran (IR)
- North Korea (KP)
- Syria (SY)

### Additional Restrictions
- Russia (RU)
- Belarus (BY)
- Occupied regions of Ukraine (via IP ranges)

## Monitoring and Alerting

### Alert Triggers
1. **Sanctioned country access**: More than 10 attempts from same IP
2. **VPN/Proxy patterns**: Detection of circumvention attempts
3. **Brute force**: Repeated violations from same IP address

### Alert Channels
- **Email**: Sent to `admin@vibemanager.app`
- **Logs**: 
  - `/var/log/nginx/blocked_access.log` (sanctioned countries)
  - `/var/log/nginx/restricted_access.log` (non-approved regions)

### Metrics Available
- `vibe_manager_blocked_access_total`: Total blocked attempts by country and reason
- `vibe_manager_blocked_unique_ips`: Unique blocked IPs in last hour
- `vibe_manager_violation_rate`: Violations per minute

## Deployment Instructions

### Prerequisites
1. MaxMind account for GeoIP database updates (free tier available)
2. Email configuration for alerts
3. Ansible 2.9+ installed

### Basic Deployment
```bash
# Deploy region restrictions only
ansible-playbook -i inventory/hosts.yml site-base.yml --tags region,restrictions

# Deploy with monitoring
ansible-playbook -i inventory/hosts.yml site-base.yml --tags region,monitoring
```

### Configuration Variables
Set these in your inventory or group_vars:
```yaml
# MaxMind configuration
maxmind_account_id: "YOUR_ACCOUNT_ID"
maxmind_license_key: "YOUR_LICENSE_KEY"

# Alert configuration
admin_email: "security@yourdomain.com"
alert_threshold: 10  # Attempts before alerting

# Monitoring interval
monitoring_interval: 300  # seconds
```

## Compliance Considerations

### GDPR Compliance
- IP addresses are logged only for security and legal compliance
- Logs are rotated and retained for 30 days
- Users are informed via error pages when access is blocked

### OFAC Compliance
- Comprehensive blocking of sanctioned countries
- Audit trail of all blocked access attempts
- Regular updates to sanctions list via GeoIP database

### User Experience
- Clear error messages explaining why access is blocked
- Contact information provided for legitimate users
- Temporary travel exception noted in terms

## Testing

### Manual Testing
```bash
# Test from allowed country (should work)
curl -H "X-Real-IP: 8.8.8.8" https://your-domain.com

# Test from blocked country (should return 451)
curl -H "X-Real-IP: 200.23.147.12" https://your-domain.com  # Cuban IP

# Test from non-approved country (should return 403)
curl -H "X-Real-IP: 196.43.235.1" https://your-domain.com  # South African IP
```

### Monitoring Verification
```bash
# Check monitoring service status
systemctl status region-monitor.timer

# View recent alerts
journalctl -u region-monitor.service -n 50

# Check fail2ban status
fail2ban-client status vibe-region
```

## Troubleshooting

### Common Issues

1. **GeoIP database not updating**
   - Check MaxMind credentials in `/etc/GeoIP.conf`
   - Run `geoipupdate` manually to test
   - Check cron job: `crontab -l | grep geoipupdate`

2. **Alerts not being sent**
   - Verify mail configuration: `echo "test" | mail -s "test" admin@domain.com`
   - Check monitoring script permissions: `ls -la /opt/monitoring/scripts/`
   - Review logs: `journalctl -u region-monitor`

3. **Legitimate users blocked**
   - Check IP in logs: `grep "USER_IP" /var/log/nginx/*.log`
   - Verify GeoIP accuracy: `geoiplookup USER_IP`
   - Consider whitelisting if necessary

### Emergency Procedures

#### Disable all restrictions temporarily
```bash
# Comment out restriction blocks in Nginx
sed -i 's/^[[:space:]]*if ($sanctioned_country)/# if ($sanctioned_country)/' /etc/nginx/sites-available/vibe-manager-ssl
sed -i 's/^[[:space:]]*if ($allowed_country/# if ($allowed_country/' /etc/nginx/sites-available/vibe-manager-ssl
nginx -t && systemctl reload nginx
```

#### Whitelist specific IP
```bash
# Add to nginx configuration
echo "allow YOUR_IP;" >> /etc/nginx/whitelist.conf
# Include in server block: include /etc/nginx/whitelist.conf;
systemctl reload nginx
```

## Maintenance

### Regular Tasks

#### Weekly
- Review blocked access logs for patterns
- Check GeoIP database updates
- Verify monitoring alerts are working

#### Monthly
- Analyze metrics for false positives
- Update sanctioned countries list if needed
- Review and update IP range blocks

#### Quarterly
- Audit compliance with current regulations
- Test disaster recovery procedures
- Update documentation with lessons learned

## Security Considerations

1. **VPN/Proxy Detection**: The system detects common VPN patterns but determined users may still circumvent
2. **IP Spoofing**: Use `real_ip_header` in Nginx to get actual client IP behind proxies
3. **DDoS Protection**: Fail2ban helps but consider additional rate limiting for blocked IPs
4. **Log Security**: Ensure log files are properly secured and access is restricted

## Future Enhancements

1. **Machine Learning**: Implement ML-based anomaly detection for sophisticated circumvention attempts
2. **API Integration**: Direct integration with sanctions databases for real-time updates
3. **User Appeals**: Automated system for legitimate users to request access review
4. **Enhanced Metrics**: More detailed analytics on blocked access patterns
5. **Multi-region Deployment**: Support for different restrictions per server region

## Support

For questions or issues related to region restrictions:
- Technical issues: Contact DevOps team
- Legal/Compliance questions: legal@vibemanager.app
- Security incidents: security@vibemanager.app