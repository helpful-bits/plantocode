#!/bin/bash

# Google Ads Platform CLI
# Part of Unified Ads Management System

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GOOGLE_DIR="$SCRIPT_DIR"
ROOT_DIR="$(dirname $(dirname "$SCRIPT_DIR"))"
CONFIG_DIR="$ROOT_DIR/config"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[38;5;33m'
NC='\033[0m'

# Load configuration
if [ -f "$CONFIG_DIR/google.env" ]; then
    export $(cat "$CONFIG_DIR/google.env" | grep -v '^#' | xargs)
fi

function print_error() {
    echo -e "${RED}✗${NC} $1" >&2
}

function print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

function print_info() {
    echo -e "${YELLOW}ℹ${NC} $1"
}

function print_header() {
    echo -e "${BLUE}==== $1 ====${NC}"
}

# OAuth2 authentication for Google Ads
function authenticate() {
    print_header "Google Ads Authentication"
    
    if [ -z "$GOOGLE_CLIENT_ID" ] || [ -z "$GOOGLE_CLIENT_SECRET" ]; then
        print_error "Missing Google OAuth credentials in config/google.env"
        return 1
    fi
    
    # Google OAuth2 flow
    local AUTH_URL="https://accounts.google.com/o/oauth2/v2/auth"
    local TOKEN_URL="https://oauth2.googleapis.com/token"
    local SCOPE="https://www.googleapis.com/auth/adwords"
    local REDIRECT_URI="${GOOGLE_REDIRECT_URI:-urn:ietf:wg:oauth:2.0:oob}"
    
    # Generate authorization URL
    local FULL_AUTH_URL="${AUTH_URL}?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=${SCOPE}&access_type=offline&prompt=consent%20select_account"
    
    echo ""
    print_info "Open this URL in your browser:"
    echo "$FULL_AUTH_URL"
    echo ""
    read -p "Enter the authorization code: " AUTH_CODE
    
    # Exchange code for tokens
    local RESPONSE=$(curl -s -X POST \
        -d "code=${AUTH_CODE}" \
        -d "client_id=${GOOGLE_CLIENT_ID}" \
        -d "client_secret=${GOOGLE_CLIENT_SECRET}" \
        -d "redirect_uri=${REDIRECT_URI}" \
        -d "grant_type=authorization_code" \
        "$TOKEN_URL")
    
    local ACCESS_TOKEN=$(echo "$RESPONSE" | jq -r '.access_token // empty')
    local REFRESH_TOKEN=$(echo "$RESPONSE" | jq -r '.refresh_token // empty')
    
    if [ -n "$ACCESS_TOKEN" ] && [ -n "$REFRESH_TOKEN" ]; then
        # Save tokens to config
        update_config "GOOGLE_ACCESS_TOKEN" "$ACCESS_TOKEN"
        update_config "GOOGLE_REFRESH_TOKEN" "$REFRESH_TOKEN"
        print_success "Authentication successful!"
    else
        print_error "Authentication failed"
        echo "$RESPONSE" | jq '.'
        return 1
    fi
}

# Refresh access token
function refresh_token() {
    if [ -z "$GOOGLE_REFRESH_TOKEN" ]; then
        print_error "No refresh token found. Please authenticate first."
        return 1
    fi
    
    local TOKEN_URL="https://oauth2.googleapis.com/token"
    local RESPONSE=$(curl -s -X POST \
        -d "refresh_token=${GOOGLE_REFRESH_TOKEN}" \
        -d "client_id=${GOOGLE_CLIENT_ID}" \
        -d "client_secret=${GOOGLE_CLIENT_SECRET}" \
        -d "grant_type=refresh_token" \
        "$TOKEN_URL")
    
    local NEW_TOKEN=$(echo "$RESPONSE" | jq -r '.access_token // empty')
    
    if [ -n "$NEW_TOKEN" ]; then
        update_config "GOOGLE_ACCESS_TOKEN" "$NEW_TOKEN"
        print_success "Token refreshed!"
    else
        print_error "Failed to refresh token"
        return 1
    fi
}

# Google Ads API request wrapper
function api_request() {
    local METHOD=$1
    local ENDPOINT=$2
    local DATA=$3
    
    if [ -z "$GOOGLE_ACCESS_TOKEN" ]; then
        print_error "Not authenticated. Run: ads google auth"
        return 1
    fi
    
    if [ -z "$GOOGLE_DEVELOPER_TOKEN" ]; then
        print_error "Missing developer token in config/google.env"
        return 1
    fi
    
    local API_VERSION="${GOOGLE_ADS_API_VERSION:-v21}"
    local BASE_URL="https://googleads.googleapis.com/${API_VERSION}"
    
    local CURL_CMD="curl -s -X ${METHOD} \
        -H 'Authorization: Bearer ${GOOGLE_ACCESS_TOKEN}' \
        -H 'developer-token: ${GOOGLE_DEVELOPER_TOKEN}' \
        -H 'Content-Type: application/json'"
    
    if [ -n "$GOOGLE_LOGIN_CUSTOMER_ID" ]; then
        CURL_CMD="${CURL_CMD} -H 'login-customer-id: ${GOOGLE_LOGIN_CUSTOMER_ID}'"
    fi
    
    if [ -n "$DATA" ]; then
        CURL_CMD="${CURL_CMD} -d '${DATA}'"
    fi
    
    CURL_CMD="${CURL_CMD} '${BASE_URL}${ENDPOINT}'"
    
    eval $CURL_CMD
}

# List accessible customer accounts
function list_customers() {
    print_header "Google Ads Accounts"
    
    local QUERY='SELECT customer_client.id, customer_client.descriptive_name FROM customer_client'
    local DATA=$(jq -n --arg q "$QUERY" '{query: $q}')
    
    api_request POST "/customers/${GOOGLE_CUSTOMER_ID}/googleAds:search" "$DATA" | jq '.'
}

# List campaigns
function list_campaigns() {
    print_header "Google Ads Campaigns"
    
    if [ -z "$GOOGLE_CUSTOMER_ID" ]; then
        print_error "No customer ID configured. Set GOOGLE_CUSTOMER_ID in config/google.env"
        return 1
    fi
    
    local QUERY='SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, metrics.cost_micros, metrics.impressions, metrics.clicks FROM campaign WHERE segments.date DURING LAST_30_DAYS'
    local DATA=$(jq -n --arg q "$QUERY" '{query: $q}')
    
    api_request POST "/customers/${GOOGLE_CUSTOMER_ID}/googleAds:searchStream" "$DATA" | jq '.'
}

# Get performance report
function get_report() {
    local START_DATE=${1:-$(date -v-30d +%Y-%m-%d 2>/dev/null || date -d '30 days ago' +%Y-%m-%d)}
    local END_DATE=${2:-$(date +%Y-%m-%d)}
    
    print_header "Performance Report ($START_DATE to $END_DATE)"
    
    # Convert dates to Google Ads format (YYYYMMDD)
    local START_FMT=$(echo $START_DATE | tr -d '-')
    local END_FMT=$(echo $END_DATE | tr -d '-')
    
    local QUERY="SELECT 
        campaign.name,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.ctr,
        metrics.average_cpc
    FROM campaign 
    WHERE segments.date BETWEEN '${START_FMT}' AND '${END_FMT}'"
    
    local DATA=$(jq -n --arg q "$QUERY" '{query: $q}')
    
    api_request POST "/customers/${GOOGLE_CUSTOMER_ID}/googleAds:searchStream" "$DATA" | \
        jq '{
            period: {start: "'$START_DATE'", end: "'$END_DATE'"},
            campaigns: [.results[].campaign],
            metrics: {
                total_impressions: [.results[].metrics.impressions] | add,
                total_clicks: [.results[].metrics.clicks] | add,
                total_cost: ([.results[].metrics.costMicros] | add) / 1000000,
                avg_ctr: ([.results[].metrics.ctr] | add) / ([.results[].metrics.ctr] | length),
                avg_cpc: ([.results[].metrics.averageCpc] | add) / ([.results[].metrics.averageCpc] | length)
            }
        }'
}

# Setup function - get customer IDs
function setup() {
    print_header "Google Ads Setup"
    
    if [ -z "$GOOGLE_ACCESS_TOKEN" ]; then
        print_info "Not authenticated. Please run authentication first."
        authenticate
    fi
    
    # List accessible accounts
    print_info "Fetching accessible accounts..."
    list_customers
    
    print_info "Please add the customer ID to config/google.env as GOOGLE_CUSTOMER_ID"
}

# Update configuration file
function update_config() {
    local KEY=$1
    local VALUE=$2
    local CONFIG_FILE="$CONFIG_DIR/google.env"
    
    if grep -q "^${KEY}=" "$CONFIG_FILE" 2>/dev/null; then
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s|^${KEY}=.*|${KEY}=${VALUE}|" "$CONFIG_FILE"
        else
            sed -i "s|^${KEY}=.*|${KEY}=${VALUE}|" "$CONFIG_FILE"
        fi
    else
        echo "${KEY}=${VALUE}" >> "$CONFIG_FILE"
    fi
}

# Main command router
function main() {
    local command=$1
    shift
    
    case $command in
        auth|login)
            authenticate
            ;;
            
        refresh)
            refresh_token
            ;;
            
        setup)
            setup
            ;;
            
        customers|accounts)
            list_customers
            ;;
            
        campaigns)
            list_campaigns
            ;;
            
        report)
            get_report "$@"
            ;;
            
        report-json)
            get_report "$@" 2>/dev/null || echo '{}'
            ;;
            
        summary)
            echo "  Platform: Google Ads (including YouTube)"
            echo "  Customer ID: ${GOOGLE_CUSTOMER_ID:-Not set}"
            echo "  Status: $([ -n "$GOOGLE_ACCESS_TOKEN" ] && echo 'Authenticated' || echo 'Not authenticated')"
            ;;
            
        help|--help|-h|"")
            echo -e "${BLUE}Google Ads Commands${NC}"
            echo ""
            echo "Authentication:"
            echo "  auth, login        - Authenticate with Google"
            echo "  refresh            - Refresh access token"
            echo ""
            echo "Setup:"
            echo "  setup              - Initial setup"
            echo "  customers, accounts - List customer accounts"
            echo ""
            echo "Campaign Management:"
            echo "  campaigns          - List all campaigns"
            echo ""
            echo "Reporting:"
            echo "  report [start end] - Get performance report"
            echo ""
            echo "Note: YouTube Ads are managed through Google Ads campaigns"
            echo "      with advertising_channel_type = 'VIDEO'"
            echo ""
            ;;
            
        *)
            print_error "Unknown Google Ads command: $command"
            echo "Run 'ads google help' for available commands"
            exit 1
            ;;
    esac
}

# Run main function
main "$@"