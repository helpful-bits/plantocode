#!/bin/bash

# LinkedIn Ads Platform CLI
# Part of Unified Ads Management System

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LINKEDIN_DIR="$SCRIPT_DIR"
ROOT_DIR="$(dirname $(dirname "$SCRIPT_DIR"))"
CONFIG_DIR="$ROOT_DIR/config"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
LINKEDIN_BLUE='\033[38;5;27m'
NC='\033[0m'

# Load configuration
if [ -f "$CONFIG_DIR/linkedin.env" ]; then
    export $(cat "$CONFIG_DIR/linkedin.env" | grep -v '^#' | xargs)
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
    echo -e "${LINKEDIN_BLUE}==== $1 ====${NC}"
}

# OAuth2 authentication for LinkedIn
function authenticate() {
    print_header "LinkedIn Ads Authentication"
    
    if [ -z "$LINKEDIN_CLIENT_ID" ] || [ -z "$LINKEDIN_CLIENT_SECRET" ]; then
        print_error "Missing LinkedIn OAuth credentials in config/linkedin.env"
        return 1
    fi
    
    # LinkedIn OAuth2 endpoints (2025 version)
    local AUTH_URL="https://www.linkedin.com/oauth/v2/authorization"
    local TOKEN_URL="https://www.linkedin.com/oauth/v2/accessToken"
    local REDIRECT_URI="${LINKEDIN_REDIRECT_URI:-http://localhost:8080/callback}"
    local SCOPE="r_ads,w_ads,r_ads_reporting,r_organization_admin,rw_organization_admin"
    
    # Generate authorization URL
    local STATE=$(openssl rand -hex 16)
    local FULL_AUTH_URL="${AUTH_URL}?response_type=code&client_id=${LINKEDIN_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&state=${STATE}&scope=${SCOPE}"
    
    echo ""
    print_info "Open this URL in your browser:"
    echo "$FULL_AUTH_URL"
    echo ""
    read -p "Enter the authorization code from the redirect URL: " AUTH_CODE
    
    # Exchange code for tokens
    local RESPONSE=$(curl -s -X POST \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "grant_type=authorization_code" \
        -d "code=${AUTH_CODE}" \
        -d "client_id=${LINKEDIN_CLIENT_ID}" \
        -d "client_secret=${LINKEDIN_CLIENT_SECRET}" \
        -d "redirect_uri=${REDIRECT_URI}" \
        "$TOKEN_URL")
    
    local ACCESS_TOKEN=$(echo "$RESPONSE" | jq -r '.access_token // empty')
    local EXPIRES_IN=$(echo "$RESPONSE" | jq -r '.expires_in // empty')
    
    if [ -n "$ACCESS_TOKEN" ]; then
        # Save token to config
        update_config "LINKEDIN_ACCESS_TOKEN" "$ACCESS_TOKEN"
        update_config "LINKEDIN_TOKEN_EXPIRES" "$(date -v+${EXPIRES_IN}S +%s 2>/dev/null || date -d "+${EXPIRES_IN} seconds" +%s)"
        print_success "Authentication successful!"
        print_info "Token expires in ${EXPIRES_IN} seconds"
    else
        print_error "Authentication failed"
        echo "$RESPONSE" | jq '.'
        return 1
    fi
}

# LinkedIn Marketing API request wrapper
function api_request() {
    local METHOD=$1
    local ENDPOINT=$2
    local DATA=$3
    
    if [ -z "$LINKEDIN_ACCESS_TOKEN" ]; then
        print_error "Not authenticated. Run: ads linkedin auth"
        return 1
    fi
    
    # Check if token is expired
    if [ -n "$LINKEDIN_TOKEN_EXPIRES" ]; then
        local CURRENT_TIME=$(date +%s)
        if [ "$CURRENT_TIME" -ge "$LINKEDIN_TOKEN_EXPIRES" ]; then
            print_error "Access token expired. Please re-authenticate."
            return 1
        fi
    fi
    
    local BASE_URL="https://api.linkedin.com/v2"
    local REST_URL="https://api.linkedin.com/rest"
    
    # Determine which base URL to use
    local FULL_URL
    if [[ "$ENDPOINT" == /rest/* ]]; then
        FULL_URL="${REST_URL}${ENDPOINT#/rest}"
    else
        FULL_URL="${BASE_URL}${ENDPOINT}"
    fi
    
    # LinkedIn API version header (2025 requirement)
    local LINKEDIN_VERSION="$(date +%Y%m)"
    
    local CURL_CMD="curl -s -X ${METHOD} \
        -H 'Authorization: Bearer ${LINKEDIN_ACCESS_TOKEN}' \
        -H 'X-Restli-Protocol-Version: 2.0.0' \
        -H 'LinkedIn-Version: ${LINKEDIN_VERSION}'"
    
    if [ "$METHOD" == "POST" ] || [ "$METHOD" == "PUT" ] || [ "$METHOD" == "PATCH" ]; then
        CURL_CMD="${CURL_CMD} -H 'Content-Type: application/json'"
        if [ -n "$DATA" ]; then
            CURL_CMD="${CURL_CMD} -d '${DATA}'"
        fi
    fi
    
    CURL_CMD="${CURL_CMD} '${FULL_URL}'"
    
    eval $CURL_CMD
}

# Get current user's ad accounts
function list_ad_accounts() {
    print_header "LinkedIn Ad Accounts"
    
    # Get user's organizations first
    local ORGS=$(api_request GET "/organizationalEntityAcls?q=roleAssignee&projection=(elements*(organizationalTarget))")
    
    echo "$ORGS" | jq -r '.elements[].organizationalTarget' | while read ORG_URN; do
        if [[ "$ORG_URN" == *"organization"* ]]; then
            local ORG_ID=$(echo "$ORG_URN" | sed 's/.*organization://')
            print_info "Organization: $ORG_ID"
            
            # Get ad accounts for this organization
            api_request GET "/adAccountsV2?q=search&search.type.values[0]=BUSINESS&search.reference.values[0]=urn:li:organization:${ORG_ID}" | \
                jq '.elements[] | {id: .id, name: .name, status: .status}'
        fi
    done
}

# List campaigns
function list_campaigns() {
    print_header "LinkedIn Campaigns"
    
    if [ -z "$LINKEDIN_AD_ACCOUNT_ID" ]; then
        print_error "No ad account ID configured. Set LINKEDIN_AD_ACCOUNT_ID in config/linkedin.env"
        print_info "Run 'ads linkedin accounts' to find your account ID"
        return 1
    fi
    
    api_request GET "/adCampaignsV2?q=search&search.account.values[0]=urn:li:sponsoredAccount:${LINKEDIN_AD_ACCOUNT_ID}" | \
        jq '.elements[] | {
            id: .id,
            name: .name,
            status: .status,
            type: .type,
            dailyBudget: .dailyBudget.amount,
            totalBudget: .totalBudget.amount,
            startDate: .runSchedule.start,
            endDate: .runSchedule.end
        }'
}

# Get campaign analytics
function get_report() {
    local START_DATE=${1:-$(date -v-30d +%Y-%m-%d 2>/dev/null || date -d '30 days ago' +%Y-%m-%d)}
    local END_DATE=${2:-$(date +%Y-%m-%d)}
    
    print_header "Performance Report ($START_DATE to $END_DATE)"
    
    if [ -z "$LINKEDIN_AD_ACCOUNT_ID" ]; then
        print_error "No ad account ID configured"
        return 1
    fi
    
    # Convert dates to timestamps
    local START_MS=$(date -jf "%Y-%m-%d" "$START_DATE" +%s000 2>/dev/null || date -d "$START_DATE" +%s000)
    local END_MS=$(date -jf "%Y-%m-%d" "$END_DATE" +%s000 2>/dev/null || date -d "$END_DATE" +%s000)
    
    # Get analytics
    local ANALYTICS_URL="/adAnalyticsV2?q=analytics"
    ANALYTICS_URL="${ANALYTICS_URL}&pivot=CAMPAIGN"
    ANALYTICS_URL="${ANALYTICS_URL}&dateRange.start.day=$(date -jf "%Y-%m-%d" "$START_DATE" +%d 2>/dev/null || date -d "$START_DATE" +%d)"
    ANALYTICS_URL="${ANALYTICS_URL}&dateRange.start.month=$(date -jf "%Y-%m-%d" "$START_DATE" +%m 2>/dev/null || date -d "$START_DATE" +%m)"
    ANALYTICS_URL="${ANALYTICS_URL}&dateRange.start.year=$(date -jf "%Y-%m-%d" "$START_DATE" +%Y 2>/dev/null || date -d "$START_DATE" +%Y)"
    ANALYTICS_URL="${ANALYTICS_URL}&dateRange.end.day=$(date -jf "%Y-%m-%d" "$END_DATE" +%d 2>/dev/null || date -d "$END_DATE" +%d)"
    ANALYTICS_URL="${ANALYTICS_URL}&dateRange.end.month=$(date -jf "%Y-%m-%d" "$END_DATE" +%m 2>/dev/null || date -d "$END_DATE" +%m)"
    ANALYTICS_URL="${ANALYTICS_URL}&dateRange.end.year=$(date -jf "%Y-%m-%d" "$END_DATE" +%Y 2>/dev/null || date -d "$END_DATE" +%Y)"
    ANALYTICS_URL="${ANALYTICS_URL}&accounts=urn:li:sponsoredAccount:${LINKEDIN_AD_ACCOUNT_ID}"
    ANALYTICS_URL="${ANALYTICS_URL}&fields=impressions,clicks,costInLocalCurrency,dateRange,pivot,pivotValues"
    
    api_request GET "$ANALYTICS_URL" | jq '{
        period: {start: "'$START_DATE'", end: "'$END_DATE'"},
        metrics: {
            impressions: .elements[0].impressions,
            clicks: .elements[0].clicks,
            cost: .elements[0].costInLocalCurrency,
            ctr: ((.elements[0].clicks / .elements[0].impressions) * 100),
            cpc: (.elements[0].costInLocalCurrency / .elements[0].clicks)
        },
        campaigns: .elements
    }'
}

# Create a test campaign
function create_campaign() {
    local NAME=${1:-"Test Campaign $(date +%s)"}
    
    if [ -z "$LINKEDIN_AD_ACCOUNT_ID" ]; then
        print_error "No ad account ID configured"
        return 1
    fi
    
    print_header "Creating Campaign: $NAME"
    
    local DATA=$(cat <<EOF
{
    "account": "urn:li:sponsoredAccount:${LINKEDIN_AD_ACCOUNT_ID}",
    "name": "${NAME}",
    "status": "PAUSED",
    "type": "TEXT_AD",
    "costType": "CPC",
    "dailyBudget": {
        "amount": "50.00",
        "currencyCode": "USD"
    },
    "runSchedule": {
        "start": $(date +%s000)
    },
    "targeting": {
        "includedTargetingFacets": {
            "locations": ["urn:li:geo:103644278"]
        }
    }
}
EOF
)
    
    api_request POST "/adCampaignsV2" "$DATA" | jq '.'
}

# Setup function
function setup() {
    print_header "LinkedIn Ads Setup"
    
    if [ -z "$LINKEDIN_ACCESS_TOKEN" ]; then
        print_info "Not authenticated. Please run authentication first."
        authenticate
    fi
    
    # List ad accounts
    print_info "Fetching ad accounts..."
    list_ad_accounts
    
    echo ""
    print_info "Please add your ad account ID to config/linkedin.env as LINKEDIN_AD_ACCOUNT_ID"
    print_info "Format: Just the numeric ID, not the full URN"
}

# Update configuration file
function update_config() {
    local KEY=$1
    local VALUE=$2
    local CONFIG_FILE="$CONFIG_DIR/linkedin.env"
    
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
            
        setup)
            setup
            ;;
            
        accounts)
            list_ad_accounts
            ;;
            
        campaigns)
            list_campaigns
            ;;
            
        campaign)
            local CAMPAIGN_ID=$1
            if [ -z "$CAMPAIGN_ID" ]; then
                print_error "Usage: ads linkedin campaign <campaign_id>"
                return 1
            fi
            api_request GET "/adCampaignsV2/${CAMPAIGN_ID}" | jq '.'
            ;;
            
        report)
            get_report "$@"
            ;;
            
        report-json)
            get_report "$@" 2>/dev/null || echo '{}'
            ;;
            
        create)
            create_campaign "$@"
            ;;
            
        summary)
            echo "  Platform: LinkedIn Campaign Manager"
            echo "  Ad Account: ${LINKEDIN_AD_ACCOUNT_ID:-Not set}"
            echo "  Status: $([ -n "$LINKEDIN_ACCESS_TOKEN" ] && echo 'Authenticated' || echo 'Not authenticated')"
            ;;
            
        help|--help|-h|"")
            echo -e "${LINKEDIN_BLUE}LinkedIn Ads Commands${NC}"
            echo ""
            echo "Authentication:"
            echo "  auth, login        - Authenticate with LinkedIn"
            echo ""
            echo "Setup:"
            echo "  setup              - Initial setup"
            echo "  accounts           - List ad accounts"
            echo ""
            echo "Campaign Management:"
            echo "  campaigns          - List all campaigns"
            echo "  campaign <id>      - Get campaign details"
            echo "  create [name]      - Create test campaign"
            echo ""
            echo "Reporting:"
            echo "  report [start end] - Get performance report"
            echo ""
            ;;
            
        *)
            print_error "Unknown LinkedIn command: $command"
            echo "Run 'ads linkedin help' for available commands"
            exit 1
            ;;
    esac
}

# Run main function
main "$@"