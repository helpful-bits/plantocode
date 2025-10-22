# Unified Ads Management CLI

A comprehensive command-line interface for managing advertising campaigns across multiple platforms from a single tool.

## 🚀 Supported Platforms

- **Reddit Ads** - Full API integration with campaign management
- **Google Ads** - Including YouTube video campaigns
- **LinkedIn Ads** - Campaign Manager integration

## 📋 Prerequisites

- **macOS/Linux** with bash shell
- **jq** - JSON processor (`brew install jq`)
- **curl** - HTTP client (usually pre-installed)
- Developer accounts for each platform you want to use

## 🛠️ Installation

1. Clone or navigate to the marketing folder:
```bash
cd /path/to/plantocode/marketing
```

2. Make the main CLI executable:
```bash
chmod +x ads
```

3. Initialize all platforms:
```bash
./ads setup-all
```

## ⚡ Quick Start

### 1. Configure Each Platform

Copy and edit the configuration files for the platforms you want to use:

```bash
# Reddit Ads
cp config/reddit.env.example config/reddit.env
nano config/reddit.env

# Google Ads (includes YouTube)
cp config/google.env.example config/google.env
nano config/google.env

# LinkedIn Ads
cp config/linkedin.env.example config/linkedin.env
nano config/linkedin.env
```

### 2. Authenticate

Authenticate with each platform:

```bash
./ads reddit auth
./ads google auth
./ads linkedin auth
```

### 3. Complete Setup

Run setup for each platform to fetch account IDs:

```bash
./ads reddit setup
./ads google setup
./ads linkedin setup
```

### 4. Start Using

```bash
# View all campaigns across platforms
./ads campaigns

# Generate unified report
./ads report

# Quick dashboard
./ads dashboard
```

## 📚 Command Reference

### Global Commands

| Command | Description |
|---------|-------------|
| `./ads help` | Show help menu |
| `./ads setup-all` | Initialize all platforms |
| `./ads status` | Show platform configuration status |
| `./ads campaigns` | List campaigns from all platforms |
| `./ads report [start] [end]` | Generate unified report |
| `./ads dashboard` | Quick overview of all platforms |

### Platform-Specific Commands

Access platform-specific features using:

```bash
./ads <platform> <command> [options]
```

Platforms: `reddit`, `google`, `linkedin` (or shortcuts: `r`, `g`, `l`)

#### Reddit Ads Commands
```bash
./ads reddit auth              # Authenticate
./ads reddit setup             # Initial setup
./ads reddit campaigns         # List campaigns
./ads reddit report            # Performance report
./ads reddit create [name]     # Create campaign (needs write access)
```

#### Google Ads Commands
```bash
./ads google auth              # Authenticate
./ads google setup             # Initial setup
./ads google campaigns         # List campaigns (includes YouTube)
./ads google report            # Performance report
./ads google customers         # List customer accounts
```

#### LinkedIn Ads Commands
```bash
./ads linkedin auth            # Authenticate
./ads linkedin setup           # Initial setup
./ads linkedin campaigns       # List campaigns
./ads linkedin report          # Performance report
./ads linkedin accounts        # List ad accounts
./ads linkedin create [name]   # Create test campaign
```

## 📁 Project Structure

```
marketing/
├── ads                        # Main unified CLI
├── config/                    # Platform configurations
│   ├── reddit.env.example
│   ├── google.env.example
│   └── linkedin.env.example
├── platforms/                 # Platform-specific implementations
│   ├── reddit/
│   │   ├── cli.sh            # Reddit CLI wrapper
│   │   ├── auth.sh           # OAuth authentication
│   │   └── api.sh            # API operations
│   ├── google/
│   │   └── cli.sh            # Google Ads CLI
│   ├── linkedin/
│   │   └── cli.sh            # LinkedIn Ads CLI
│   └── shared/
│       └── utils.sh          # Shared utilities
├── reports/                   # Generated reports directory
└── docs/                      # Additional documentation
    ├── reddit-api-guide.md
    ├── google-api-guide.md
    └── linkedin-api-guide.md
```

## 🔑 Platform Setup Guides

### Reddit Ads

1. Create Reddit App: https://www.reddit.com/prefs/apps
2. Get client ID and secret
3. Configure in `config/reddit.env`
4. Required scopes: `adsread,adsedit,adsconversions`

### Google Ads

1. Create Google Cloud Project: https://console.cloud.google.com/
2. Enable Google Ads API
3. Create OAuth2 credentials (Desktop type)
4. Get Developer Token from Google Ads UI
5. Configure in `config/google.env`

**Note**: YouTube Ads are managed through Google Ads video campaigns

### LinkedIn Ads

1. Create LinkedIn App: https://www.linkedin.com/developers/
2. Request Marketing Developer Platform access
3. Get OAuth credentials
4. Configure in `config/linkedin.env`
5. Required products: Marketing Developer Platform

## 📊 Reporting

Generate unified reports across all platforms:

```bash
# Last 30 days (default)
./ads report

# Specific date range
./ads report 2025-01-01 2025-01-31

# Export to file
./ads report > reports/january_report.json
```

Reports are saved in JSON format in the `reports/` directory.

## 🔧 Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| **401 Unauthorized** | Token expired, re-authenticate: `./ads <platform> auth` |
| **403 Forbidden** | Missing permissions, check API access and scopes |
| **429 Rate Limited** | Too many requests, wait and retry |
| **Missing jq** | Install: `brew install jq` (macOS) or `apt-get install jq` (Linux) |

### Debug Mode

Enable verbose output by setting debug environment variable:

```bash
DEBUG=1 ./ads reddit campaigns
```

## 🔄 Token Management

Tokens are stored in platform configuration files:
- Reddit: Supports refresh tokens (permanent access)
- Google: Supports refresh tokens (permanent access)
- LinkedIn: Access tokens expire, requires re-authentication

## 🚦 Rate Limits

Each platform has different rate limits:
- **Reddit**: 60 requests per minute
- **Google**: 15,000 requests per day
- **LinkedIn**: 100 requests per day (varies by endpoint)

## 📈 Advanced Usage

### Automation with Cron

Set up automated reporting:

```bash
# Daily report at 9 AM
0 9 * * * /path/to/marketing/ads report >> /path/to/logs/daily_report.log 2>&1

# Weekly campaign check
0 10 * * 1 /path/to/marketing/ads campaigns >> /path/to/logs/weekly_campaigns.log 2>&1
```

### Integration with Other Tools

Export data for analysis:

```bash
# Export to CSV (requires additional processing)
./ads report | jq -r '.platforms.reddit.campaigns[] | [.id, .name, .status] | @csv'

# Pipe to monitoring tools
./ads dashboard | grep "Active Campaigns" | cut -d: -f2
```

## 🤝 Contributing

To add support for a new advertising platform:

1. Create a new directory in `platforms/<platform_name>/`
2. Implement `cli.sh` with standard commands (auth, campaigns, report)
3. Add configuration template in `config/<platform>.env.example`
4. Update the main `ads` script to include the new platform
5. Add documentation in `docs/<platform>-api-guide.md`

## 📝 License

This tool is part of the PlanToCode project.

## 🆘 Support

For issues or questions:
- Check the platform-specific documentation in `docs/`
- Review the configuration examples
- Ensure all prerequisites are installed
- Verify API access and permissions

---

**Version**: 2.0.0  
**Last Updated**: 2025