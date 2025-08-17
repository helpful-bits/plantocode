#!/bin/bash

# Reddit Ads API Authentication Script
# This script handles the OAuth flow for Reddit Ads API

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
NC='\033[0m' # No Color

# User agent string
USER_AGENT="${APP_NAME}/${APP_VERSION} by ${REDDIT_USERNAME}"

function print_step() {
    echo -e "${GREEN}[STEP]${NC} $1"
}

function print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

function print_info() {
    echo -e "${YELLOW}[INFO]${NC} $1"
}

# Function to URL encode strings
urlencode() {
    echo -n "$1" | jq -sRr @uri
}

# Step 1: Generate authorization URL
function generate_auth_url() {
    print_step "Generating authorization URL..."
    
    ENCODED_SCOPES=$(urlencode "$REDDIT_SCOPES")
    ENCODED_REDIRECT=$(urlencode "$REDDIT_REDIRECT_URI")
    
    AUTH_URL="${REDDIT_OAUTH_BASE_URL}/authorize?client_id=${REDDIT_CLIENT_ID}&response_type=code&state=randomstate123&redirect_uri=${ENCODED_REDIRECT}&duration=permanent&scope=${ENCODED_SCOPES}"
    
    echo ""
    print_info "Please open this URL in your browser to authorize the application:"
    echo ""
    echo "$AUTH_URL"
    echo ""
    print_info "After authorization, you'll be redirected to a URL containing a 'code' parameter."
    echo ""
    read -p "Enter the authorization code from the redirect URL: " AUTH_CODE
    
    if [ -z "$AUTH_CODE" ]; then
        print_error "No authorization code provided"
        exit 1
    fi
    
    exchange_code_for_tokens "$AUTH_CODE"
}

# Step 2: Exchange authorization code for tokens
function exchange_code_for_tokens() {
    local AUTH_CODE=$1
    print_step "Exchanging authorization code for tokens..."
    
    RESPONSE=$(curl -s -X POST \
        -H 'content-type: application/x-www-form-urlencoded' \
        -A "$USER_AGENT" \
        -u "${REDDIT_CLIENT_ID}:${REDDIT_CLIENT_SECRET}" \
        -d "grant_type=authorization_code&code=${AUTH_CODE}&redirect_uri=${REDDIT_REDIRECT_URI}" \
        "${REDDIT_OAUTH_BASE_URL}/access_token")
    
    ACCESS_TOKEN=$(echo "$RESPONSE" | jq -r '.access_token // empty')
    REFRESH_TOKEN=$(echo "$RESPONSE" | jq -r '.refresh_token // empty')
    
    if [ -z "$ACCESS_TOKEN" ] || [ -z "$REFRESH_TOKEN" ]; then
        print_error "Failed to obtain tokens"
        echo "Response: $RESPONSE"
        exit 1
    fi
    
    print_info "Successfully obtained tokens!"
    
    # Update .env file with tokens
    update_env_file "REDDIT_ACCESS_TOKEN" "$ACCESS_TOKEN"
    update_env_file "REDDIT_REFRESH_TOKEN" "$REFRESH_TOKEN"
    
    print_info "Tokens saved to .env file"
}

# Function to refresh access token
function refresh_token() {
    print_step "Refreshing access token..."
    
    if [ -z "$REDDIT_REFRESH_TOKEN" ]; then
        print_error "No refresh token found. Please run initial authentication first."
        exit 1
    fi
    
    RESPONSE=$(curl -s -X POST \
        -H 'content-type: application/x-www-form-urlencoded' \
        -A "$USER_AGENT" \
        -u "${REDDIT_CLIENT_ID}:${REDDIT_CLIENT_SECRET}" \
        -d "grant_type=refresh_token&refresh_token=${REDDIT_REFRESH_TOKEN}" \
        "${REDDIT_OAUTH_BASE_URL}/access_token")
    
    NEW_ACCESS_TOKEN=$(echo "$RESPONSE" | jq -r '.access_token // empty')
    
    if [ -z "$NEW_ACCESS_TOKEN" ]; then
        print_error "Failed to refresh token"
        echo "Response: $RESPONSE"
        exit 1
    fi
    
    print_info "Successfully refreshed access token!"
    
    # Update .env file with new token
    update_env_file "REDDIT_ACCESS_TOKEN" "$NEW_ACCESS_TOKEN"
    
    print_info "New access token saved to .env file"
}

# Function to update .env file
function update_env_file() {
    local KEY=$1
    local VALUE=$2
    local CONFIG_FILE="$CONFIG_DIR/reddit.env"
    
    if grep -q "^${KEY}=" "$CONFIG_FILE"; then
        # Key exists, update it (works on both macOS and Linux)
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

# Main menu
function main_menu() {
    echo ""
    echo "Reddit Ads API Authentication Manager"
    echo "======================================"
    echo ""
    echo "1) New Authentication (Get new tokens)"
    echo "2) Refresh Access Token"
    echo "3) Test Current Token"
    echo "4) Exit"
    echo ""
    read -p "Select an option: " OPTION
    
    case $OPTION in
        1)
            generate_auth_url
            ;;
        2)
            refresh_token
            ;;
        3)
            test_token
            ;;
        4)
            exit 0
            ;;
        *)
            print_error "Invalid option"
            main_menu
            ;;
    esac
}

# Function to test current token
function test_token() {
    print_step "Testing current access token..."
    
    if [ -z "$REDDIT_ACCESS_TOKEN" ]; then
        print_error "No access token found. Please authenticate first."
        exit 1
    fi
    
    RESPONSE=$(curl -s -w "\n%{http_code}" \
        -H "Authorization: Bearer ${REDDIT_ACCESS_TOKEN}" \
        -H "User-Agent: $USER_AGENT" \
        "${REDDIT_API_BASE_URL}/me")
    
    HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
    BODY=$(echo "$RESPONSE" | head -n -1)
    
    if [ "$HTTP_CODE" == "200" ]; then
        print_info "Token is valid!"
        echo ""
        echo "User info:"
        echo "$BODY" | jq '.'
    else
        print_error "Token test failed (HTTP $HTTP_CODE)"
        echo "Response: $BODY"
    fi
}

# Check for jq dependency
if ! command -v jq &> /dev/null; then
    print_error "jq is required but not installed. Please install it first."
    echo "On macOS: brew install jq"
    echo "On Ubuntu/Debian: sudo apt-get install jq"
    exit 1
fi

# Run main menu
main_menu