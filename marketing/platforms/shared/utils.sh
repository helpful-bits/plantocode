#!/bin/bash

# Shared Utilities for Ads Management CLI
# Common functions used across all platforms

# Colors
export RED='\033[0;31m'
export GREEN='\033[0;32m'
export YELLOW='\033[1;33m'
export BLUE='\033[0;34m'
export CYAN='\033[0;36m'
export MAGENTA='\033[0;35m'
export BOLD='\033[1m'
export NC='\033[0m'

# Platform-specific colors
export REDDIT_COLOR='\033[38;5;202m'
export GOOGLE_COLOR='\033[38;5;33m'
export LINKEDIN_COLOR='\033[38;5;27m'

# Common print functions
function print_error() {
    echo -e "${RED}✗${NC} $1" >&2
}

function print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

function print_info() {
    echo -e "${YELLOW}ℹ${NC} $1"
}

function print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

function print_header() {
    local COLOR=${2:-$CYAN}
    echo -e "${COLOR}==== $1 ====${NC}"
}

# Configuration management
function update_env_file() {
    local KEY=$1
    local VALUE=$2
    local FILE=$3
    
    if [ -z "$FILE" ]; then
        print_error "No configuration file specified"
        return 1
    fi
    
    if grep -q "^${KEY}=" "$FILE" 2>/dev/null; then
        # Key exists, update it
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s|^${KEY}=.*|${KEY}=${VALUE}|" "$FILE"
        else
            sed -i "s|^${KEY}=.*|${KEY}=${VALUE}|" "$FILE"
        fi
    else
        # Key doesn't exist, append it
        echo "${KEY}=${VALUE}" >> "$FILE"
    fi
}

# Load environment file
function load_env_file() {
    local ENV_FILE=$1
    
    if [ -f "$ENV_FILE" ]; then
        export $(cat "$ENV_FILE" | grep -v '^#' | xargs)
        return 0
    else
        return 1
    fi
}

# Check for required environment variables
function check_required_vars() {
    local VARS=("$@")
    local MISSING=()
    
    for VAR in "${VARS[@]}"; do
        if [ -z "${!VAR}" ]; then
            MISSING+=("$VAR")
        fi
    done
    
    if [ ${#MISSING[@]} -gt 0 ]; then
        print_error "Missing required configuration: ${MISSING[*]}"
        return 1
    fi
    
    return 0
}

# JSON formatting helpers
function format_json() {
    if command -v jq &> /dev/null; then
        jq '.'
    else
        cat
    fi
}

function extract_json_field() {
    local FIELD=$1
    if command -v jq &> /dev/null; then
        jq -r "$FIELD // empty"
    else
        # Fallback to grep/sed if jq is not available
        grep "\"$FIELD\"" | sed 's/.*"'$FIELD'"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/'
    fi
}

# Date formatting
function format_date_iso() {
    local DATE=$1
    if [[ "$OSTYPE" == "darwin"* ]]; then
        date -jf "%Y-%m-%d" "$DATE" +%Y-%m-%d 2>/dev/null || date +%Y-%m-%d
    else
        date -d "$DATE" +%Y-%m-%d 2>/dev/null || date +%Y-%m-%d
    fi
}

function get_date_days_ago() {
    local DAYS=$1
    if [[ "$OSTYPE" == "darwin"* ]]; then
        date -v-${DAYS}d +%Y-%m-%d
    else
        date -d "${DAYS} days ago" +%Y-%m-%d
    fi
}

# URL encoding
function urlencode() {
    local STRING=$1
    if command -v jq &> /dev/null; then
        echo -n "$STRING" | jq -sRr @uri
    else
        # Fallback to Python if available
        if command -v python3 &> /dev/null; then
            python3 -c "import urllib.parse; print(urllib.parse.quote('$STRING'), end='')"
        else
            # Basic encoding
            echo -n "$STRING" | sed 's/ /%20/g; s/!/%21/g; s/"/%22/g; s/#/%23/g; s/\$/%24/g; s/\&/%26/g; s/'"'"'/%27/g; s/(/%28/g; s/)/%29/g'
        fi
    fi
}

# HTTP status code checker
function check_http_status() {
    local STATUS=$1
    local RESPONSE=$2
    
    case $STATUS in
        200|201|204)
            return 0
            ;;
        400)
            print_error "Bad Request (400)"
            echo "$RESPONSE" | format_json
            return 1
            ;;
        401)
            print_error "Unauthorized (401) - Authentication required or token expired"
            return 1
            ;;
        403)
            print_error "Forbidden (403) - Insufficient permissions"
            return 1
            ;;
        404)
            print_error "Not Found (404)"
            return 1
            ;;
        429)
            print_error "Rate Limited (429) - Too many requests"
            return 1
            ;;
        500|502|503|504)
            print_error "Server Error ($STATUS)"
            return 1
            ;;
        *)
            print_error "Unexpected status code: $STATUS"
            echo "$RESPONSE" | format_json
            return 1
            ;;
    esac
}

# Spinner for long operations
function show_spinner() {
    local PID=$1
    local MESSAGE=${2:-"Processing"}
    local SPINNER="⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"
    local i=0
    
    while kill -0 $PID 2>/dev/null; do
        printf "\r${YELLOW}%s${NC} %s" "${SPINNER:i++%${#SPINNER}:1}" "$MESSAGE"
        sleep 0.1
    done
    printf "\r"
}

# Table formatting
function print_table_header() {
    local COLUMNS=("$@")
    local SEPARATOR=""
    
    printf "${BOLD}"
    for COL in "${COLUMNS[@]}"; do
        printf "%-20s " "$COL"
    done
    printf "${NC}\n"
    
    for COL in "${COLUMNS[@]}"; do
        printf "%-20s " "--------------------"
    done
    printf "\n"
}

function print_table_row() {
    local VALUES=("$@")
    
    for VAL in "${VALUES[@]}"; do
        # Truncate if too long
        if [ ${#VAL} -gt 18 ]; then
            VAL="${VAL:0:15}..."
        fi
        printf "%-20s " "$VAL"
    done
    printf "\n"
}

# Cost formatting
function format_cost() {
    local COST=$1
    local CURRENCY=${2:-USD}
    
    if command -v printf &> /dev/null; then
        printf "%s %.2f" "$CURRENCY" "$COST"
    else
        echo "${CURRENCY} ${COST}"
    fi
}

# Percentage formatting
function format_percentage() {
    local VALUE=$1
    printf "%.2f%%" "$VALUE"
}

# Export functions for use in other scripts
export -f print_error
export -f print_success
export -f print_info
export -f print_warning
export -f print_header
export -f update_env_file
export -f load_env_file
export -f check_required_vars
export -f format_json
export -f extract_json_field
export -f format_date_iso
export -f get_date_days_ago
export -f urlencode
export -f check_http_status
export -f show_spinner
export -f print_table_header
export -f print_table_row
export -f format_cost
export -f format_percentage