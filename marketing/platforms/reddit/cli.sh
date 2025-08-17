#!/bin/bash

# Reddit Ads Platform CLI
# Part of Unified Ads Management System

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REDDIT_DIR="$SCRIPT_DIR"
ROOT_DIR="$(dirname $(dirname "$SCRIPT_DIR"))"

# Source the existing Reddit scripts
AUTH_SCRIPT="$REDDIT_DIR/auth.sh"
API_SCRIPT="$REDDIT_DIR/api.sh"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
ORANGE='\033[38;5;202m'
NC='\033[0m'

function print_error() {
    echo -e "${RED}✗${NC} $1" >&2
}

function print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

function print_info() {
    echo -e "${YELLOW}ℹ${NC} $1"
}

# Main command router
function main() {
    local command=$1
    shift
    
    case $command in
        auth|login)
            "$AUTH_SCRIPT"
            ;;
            
        setup)
            "$API_SCRIPT" setup
            ;;
            
        campaigns)
            "$API_SCRIPT" campaigns
            ;;
            
        campaign)
            "$API_SCRIPT" campaign-details "$@"
            ;;
            
        report)
            "$API_SCRIPT" report "$@"
            ;;
            
        report-json)
            # Special JSON output for unified reporting
            "$API_SCRIPT" report "$@" | jq -c '.' 2>/dev/null || echo '{}'
            ;;
            
        create)
            "$API_SCRIPT" create-campaign "$@"
            ;;
            
        me|profile)
            "$API_SCRIPT" me
            ;;
            
        businesses)
            "$API_SCRIPT" businesses
            ;;
            
        accounts)
            "$API_SCRIPT" accounts
            ;;
            
        config)
            "$API_SCRIPT" config
            ;;
            
        summary)
            # Quick summary for dashboard
            echo "  Active Campaigns: $(${API_SCRIPT} campaigns 2>/dev/null | jq '.data | length' 2>/dev/null || echo '0')"
            echo "  Last 7 days spend: $(${API_SCRIPT} report $(date -v-7d +%Y-%m-%d 2>/dev/null || date -d '7 days ago' +%Y-%m-%d) $(date +%Y-%m-%d) 2>/dev/null | jq '.data[0].metrics.spend // 0' 2>/dev/null || echo 'N/A')"
            ;;
            
        help|--help|-h|"")
            echo -e "${ORANGE}Reddit Ads Commands${NC}"
            echo ""
            echo "Authentication:"
            echo "  auth, login        - Authenticate with Reddit"
            echo ""
            echo "Setup:"
            echo "  setup              - Initial setup (fetch IDs)"
            echo ""
            echo "Campaign Management:"
            echo "  campaigns          - List all campaigns"
            echo "  campaign <id>      - Get campaign details"
            echo "  create [name]      - Create campaign (needs write access)"
            echo ""
            echo "Reporting:"
            echo "  report [start end] - Get performance report"
            echo ""
            echo "Account Info:"
            echo "  me, profile        - Get user info"
            echo "  businesses         - List businesses"
            echo "  accounts           - List ad accounts"
            echo "  config             - Show configuration"
            echo ""
            ;;
            
        *)
            print_error "Unknown Reddit command: $command"
            echo "Run 'ads reddit help' for available commands"
            exit 1
            ;;
    esac
}

# Run main function
main "$@"