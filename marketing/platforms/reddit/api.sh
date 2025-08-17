#!/bin/bash

# Reddit Ads API Operations Script
# Common API operations wrapped in easy-to-use functions

# Script location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname $(dirname "$SCRIPT_DIR"))"
CONFIG_DIR="$ROOT_DIR/config"

# Load environment variables
if [ -f "$CONFIG_DIR/reddit.env" ]; then
    export $(cat "$CONFIG_DIR/reddit.env" | grep -v '^#' | xargs)
else
    echo "Error: reddit.env file not found. Please copy reddit.env.example to reddit.env and configure it."
    echo "Location: $CONFIG_DIR/reddit.env"
    exit 1
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# User agent string
USER_AGENT="${APP_NAME}/${APP_VERSION} by ${REDDIT_USERNAME}"

function print_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

function print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

function print_info() {
    echo -e "${YELLOW}[INFO]${NC} $1"
}

function print_header() {
    echo -e "${BLUE}==== $1 ====${NC}"
}

# API request wrapper
function api_request() {
    local METHOD=$1
    local ENDPOINT=$2
    local DATA=$3
    
    if [ -z "$REDDIT_ACCESS_TOKEN" ]; then
        print_error "No access token found. Please run ./reddit-auth.sh first"
        exit 1
    fi
    
    local CURL_CMD="curl -s -X ${METHOD} \
        -H 'Authorization: Bearer ${REDDIT_ACCESS_TOKEN}' \
        -H 'User-Agent: ${USER_AGENT}'"
    
    if [ "$METHOD" == "POST" ] || [ "$METHOD" == "PUT" ] || [ "$METHOD" == "PATCH" ]; then
        CURL_CMD="${CURL_CMD} -H 'Content-Type: application/json'"
        if [ -n "$DATA" ]; then
            CURL_CMD="${CURL_CMD} -d '${DATA}'"
        fi
    fi
    
    CURL_CMD="${CURL_CMD} '${REDDIT_API_BASE_URL}${ENDPOINT}'"
    
    eval $CURL_CMD
}

# Get current user/member info
function get_me() {
    print_header "User Profile"
    RESPONSE=$(api_request GET "/me")
    echo "$RESPONSE" | jq '.'
    
    # Extract and save member ID if not already saved
    MEMBER_ID=$(echo "$RESPONSE" | jq -r '.id // empty')
    if [ -n "$MEMBER_ID" ] && ! grep -q "^REDDIT_MEMBER_ID=" .env; then
        echo "REDDIT_MEMBER_ID=${MEMBER_ID}" >> .env
        print_info "Member ID saved to .env"
    fi
}

# List businesses
function list_businesses() {
    print_header "Your Businesses"
    RESPONSE=$(api_request GET "/me/businesses")
    echo "$RESPONSE" | jq '.'
    
    # Extract first business ID if not already saved
    if [ -z "$REDDIT_BUSINESS_ID" ]; then
        BUSINESS_ID=$(echo "$RESPONSE" | jq -r '.data[0].id // empty')
        if [ -n "$BUSINESS_ID" ]; then
            update_env_file "REDDIT_BUSINESS_ID" "$BUSINESS_ID"
            print_info "Business ID saved to .env: $BUSINESS_ID"
        fi
    fi
}

# List ad accounts for a business
function list_ad_accounts() {
    if [ -z "$REDDIT_BUSINESS_ID" ]; then
        print_error "No business ID found. Please run 'list-businesses' first"
        return 1
    fi
    
    print_header "Ad Accounts for Business: $REDDIT_BUSINESS_ID"
    RESPONSE=$(api_request GET "/businesses/${REDDIT_BUSINESS_ID}/ad_accounts")
    echo "$RESPONSE" | jq '.'
    
    # Extract first ad account ID if not already saved
    if [ -z "$REDDIT_AD_ACCOUNT_ID" ]; then
        AD_ACCOUNT_ID=$(echo "$RESPONSE" | jq -r '.data[0].id // empty')
        if [ -n "$AD_ACCOUNT_ID" ]; then
            update_env_file "REDDIT_AD_ACCOUNT_ID" "$AD_ACCOUNT_ID"
            print_info "Ad Account ID saved to .env: $AD_ACCOUNT_ID"
        fi
    fi
}

# List campaigns
function list_campaigns() {
    if [ -z "$REDDIT_AD_ACCOUNT_ID" ]; then
        print_error "No ad account ID found. Please run setup first"
        return 1
    fi
    
    print_header "Campaigns for Ad Account: $REDDIT_AD_ACCOUNT_ID"
    RESPONSE=$(api_request GET "/ad_accounts/${REDDIT_AD_ACCOUNT_ID}/campaigns")
    echo "$RESPONSE" | jq '.'
}

# Get campaign details
function get_campaign() {
    local CAMPAIGN_ID=$1
    
    if [ -z "$CAMPAIGN_ID" ]; then
        print_error "Usage: $0 campaign-details <campaign_id>"
        return 1
    fi
    
    if [ -z "$REDDIT_AD_ACCOUNT_ID" ]; then
        print_error "No ad account ID found. Please run setup first"
        return 1
    fi
    
    print_header "Campaign Details: $CAMPAIGN_ID"
    RESPONSE=$(api_request GET "/ad_accounts/${REDDIT_AD_ACCOUNT_ID}/campaigns/${CAMPAIGN_ID}")
    echo "$RESPONSE" | jq '.'
}

# Get performance report
function get_report() {
    local START_DATE=${1:-$(date -v-30d +%Y-%m-%d 2>/dev/null || date -d '30 days ago' +%Y-%m-%d)}
    local END_DATE=${2:-$(date +%Y-%m-%d)}
    local LEVEL=${3:-CAMPAIGN}
    
    if [ -z "$REDDIT_AD_ACCOUNT_ID" ]; then
        print_error "No ad account ID found. Please run setup first"
        return 1
    fi
    
    print_header "Performance Report ($START_DATE to $END_DATE)"
    
    DATA=$(cat <<EOF
{
    "level": "${LEVEL}",
    "timeframe": {
        "start_date": "${START_DATE}",
        "end_date": "${END_DATE}"
    },
    "metrics": ["IMPRESSIONS", "CLICKS", "SPEND", "CTR", "CPC"],
    "breakdowns": ["DATE"]
}
EOF
)
    
    RESPONSE=$(api_request POST "/ad_accounts/${REDDIT_AD_ACCOUNT_ID}/reports" "$DATA")
    echo "$RESPONSE" | jq '.'
}

# Create a test campaign (requires write access)
function create_campaign() {
    local NAME=${1:-"Test Campaign $(date +%s)"}
    
    if [ -z "$REDDIT_AD_ACCOUNT_ID" ]; then
        print_error "No ad account ID found. Please run setup first"
        return 1
    fi
    
    print_header "Creating Campaign: $NAME"
    
    DATA=$(cat <<EOF
{
    "data": {
        "name": "${NAME}",
        "configured_status": "PAUSED",
        "objective": "IMPRESSIONS",
        "funding_instrument_id": null,
        "start_date": "$(date +%Y-%m-%d)",
        "bid_strategy": "MANUAL_CPC",
        "bid_amount": 100
    }
}
EOF
)
    
    RESPONSE=$(api_request POST "/ad_accounts/${REDDIT_AD_ACCOUNT_ID}/campaigns" "$DATA")
    echo "$RESPONSE" | jq '.'
    
    if echo "$RESPONSE" | jq -e '.error' > /dev/null 2>&1; then
        print_error "Campaign creation failed. You may need write access approval."
    else
        print_success "Campaign created successfully!"
    fi
}

# Update .env file helper
function update_env_file() {
    local KEY=$1
    local VALUE=$2
    local CONFIG_FILE="$CONFIG_DIR/reddit.env"
    
    if grep -q "^${KEY}=" "$CONFIG_FILE"; then
        # Key exists, update it
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s|^${KEY}=.*|${KEY}=${VALUE}|" "$CONFIG_FILE"
        else
            sed -i "s|^${KEY}=.*|${KEY}=${VALUE}|" "$CONFIG_FILE"
        fi
    else
        # Key doesn't exist, append it
        echo "${KEY}=${VALUE}" >> "$CONFIG_FILE"
    fi
}

# Initial setup - get all IDs
function setup() {
    print_header "Reddit Ads API Setup"
    print_info "This will fetch and save your business and ad account IDs"
    echo ""
    
    # Get user info
    get_me
    echo ""
    
    # Get businesses
    list_businesses
    echo ""
    
    # Get ad accounts
    list_ad_accounts
    echo ""
    
    print_success "Setup complete! Your IDs have been saved to .env"
}

# Show current configuration
function show_config() {
    print_header "Current Configuration"
    echo "Client ID: ${REDDIT_CLIENT_ID:0:10}..."
    echo "Username: $REDDIT_USERNAME"
    echo "Business ID: ${REDDIT_BUSINESS_ID:-Not set}"
    echo "Ad Account ID: ${REDDIT_AD_ACCOUNT_ID:-Not set}"
    echo "Access Token: ${REDDIT_ACCESS_TOKEN:0:20}..."
    echo "Refresh Token: ${REDDIT_REFRESH_TOKEN:0:20}..."
}

# Main function
function main() {
    local COMMAND=$1
    shift
    
    case $COMMAND in
        setup)
            setup
            ;;
        me)
            get_me
            ;;
        businesses)
            list_businesses
            ;;
        accounts)
            list_ad_accounts
            ;;
        campaigns)
            list_campaigns
            ;;
        campaign-details)
            get_campaign "$@"
            ;;
        report)
            get_report "$@"
            ;;
        create-campaign)
            create_campaign "$@"
            ;;
        config)
            show_config
            ;;
        help|--help|-h|"")
            echo "Reddit Ads API CLI"
            echo ""
            echo "Usage: $0 <command> [options]"
            echo ""
            echo "Commands:"
            echo "  setup              - Initial setup (fetches and saves IDs)"
            echo "  me                 - Get current user info"
            echo "  businesses         - List your businesses"
            echo "  accounts           - List ad accounts"
            echo "  campaigns          - List campaigns"
            echo "  campaign-details   - Get campaign details (requires campaign ID)"
            echo "  report             - Get performance report"
            echo "                       Usage: report [start_date] [end_date] [level]"
            echo "                       Defaults: last 30 days, CAMPAIGN level"
            echo "  create-campaign    - Create a test campaign (requires write access)"
            echo "                       Usage: create-campaign [name]"
            echo "  config             - Show current configuration"
            echo "  help               - Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0 setup"
            echo "  $0 campaigns"
            echo "  $0 report 2025-07-01 2025-07-31"
            echo "  $0 campaign-details abc123"
            echo "  $0 create-campaign 'Summer Sale Campaign'"
            ;;
        *)
            print_error "Unknown command: $COMMAND"
            echo "Run '$0 help' for usage information"
            exit 1
            ;;
    esac
}

# Check for jq dependency
if ! command -v jq &> /dev/null; then
    print_error "jq is required but not installed. Please install it first."
    echo "On macOS: brew install jq"
    echo "On Ubuntu/Debian: sudo apt-get install jq"
    exit 1
fi

# Run main function with all arguments
main "$@"