#!/bin/bash

# Migration script to apply database changes to production servers
# Usage: ./apply_migration.sh [us|eu|all]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
MIGRATION_FILE="add_consent_tracking.sql"
ANSIBLE_DIR="../ansible"
INVENTORY="inventory/hosts.yml"
VAULT_PASS=".vault_pass"

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to apply migration to a specific server
apply_migration() {
    local server=$1
    local secrets_file=$2
    local server_name=$3
    
    print_status "Applying migration to $server_name server ($server)..."
    
    # First, check if tables already exist (to avoid duplicate migration)
    print_status "Checking if migration was already applied..."
    
    ansible $server -i $INVENTORY -m shell \
        -a "PGPASSWORD='{{ db_password }}' psql -h localhost -U {{ db_user }} -d {{ db_name }} -c \"SELECT COUNT(*) FROM pg_tables WHERE tablename IN ('legal_documents', 'user_consent_events', 'user_consents');\" -t" \
        --vault-password-file $VAULT_PASS \
        -e @$secrets_file 2>/dev/null | grep -q "3" && {
            print_warning "Migration appears to be already applied on $server_name (consent tables exist). Skipping..."
            return 0
        }
    
    # Copy migration file to server
    print_status "Copying migration file to $server_name server..."
    ansible $server -i $INVENTORY -m copy \
        -a "src=../migrations/$MIGRATION_FILE dest=/tmp/$MIGRATION_FILE" \
        --vault-password-file $VAULT_PASS
    
    # Apply migration
    print_status "Executing migration on $server_name database..."
    ansible $server -i $INVENTORY -m shell \
        -a "PGPASSWORD='{{ db_password }}' psql -h localhost -U {{ db_user }} -d {{ db_name }} -f /tmp/$MIGRATION_FILE" \
        --vault-password-file $VAULT_PASS \
        -e @$secrets_file
    
    # Verify migration
    print_status "Verifying migration on $server_name..."
    
    # Check if tables were created
    table_count=$(ansible $server -i $INVENTORY -m shell \
        -a "PGPASSWORD='{{ db_password }}' psql -h localhost -U {{ db_user }} -d {{ db_name }} -c \"SELECT COUNT(*) FROM pg_tables WHERE tablename IN ('legal_documents', 'user_consent_events', 'user_consents');\" -t" \
        --vault-password-file $VAULT_PASS \
        -e @$secrets_file 2>/dev/null | tail -1 | tr -d ' ')
    
    if [ "$table_count" = "3" ]; then
        print_status "✓ Consent tracking tables created successfully"
    else
        print_error "✗ Expected 3 consent tables, found $table_count"
        return 1
    fi
    
    # Check if functions were created
    func_count=$(ansible $server -i $INVENTORY -m shell \
        -a "PGPASSWORD='{{ db_password }}' psql -h localhost -U {{ db_user }} -d {{ db_name }} -c \"SELECT COUNT(*) FROM pg_proc WHERE proname IN ('user_has_current_consent', 'record_consent_event');\" -t" \
        --vault-password-file $VAULT_PASS \
        -e @$secrets_file 2>/dev/null | tail -1 | tr -d ' ')
    
    if [ "$func_count" = "2" ]; then
        print_status "✓ Utility functions created successfully"
    else
        print_error "✗ Expected 2 functions, found $func_count"
        return 1
    fi
    
    # Check if legal documents were inserted
    doc_count=$(ansible $server -i $INVENTORY -m shell \
        -a "PGPASSWORD='{{ db_password }}' psql -h localhost -U {{ db_user }} -d {{ db_name }} -c \"SELECT COUNT(*) FROM legal_documents;\" -t" \
        --vault-password-file $VAULT_PASS \
        -e @$secrets_file 2>/dev/null | tail -1 | tr -d ' ')
    
    if [ "$doc_count" = "4" ]; then
        print_status "✓ Initial legal documents inserted successfully"
    else
        print_error "✗ Expected 4 legal documents, found $doc_count"
        return 1
    fi
    
    # Clean up
    print_status "Cleaning up temporary files on $server_name..."
    ansible $server -i $INVENTORY -m file \
        -a "path=/tmp/$MIGRATION_FILE state=absent" \
        --vault-password-file $VAULT_PASS
    
    print_status "✅ Migration completed successfully on $server_name!"
    return 0
}

# Main script
cd "$(dirname "$0")"

# Check if migration file exists
if [ ! -f "$MIGRATION_FILE" ]; then
    print_error "Migration file $MIGRATION_FILE not found!"
    exit 1
fi

# Change to ansible directory
cd $ANSIBLE_DIR

# Check if vault password file exists
if [ ! -f "$VAULT_PASS" ]; then
    print_error "Vault password file not found at $VAULT_PASS"
    print_status "Please ensure you're in the infrastructure/ansible directory and .vault_pass exists"
    exit 1
fi

# Parse command line arguments
TARGET=${1:-all}

case $TARGET in
    us)
        print_status "=== Applying migration to US server ==="
        apply_migration "interserver-us" "group_vars/interserver/secrets.yml" "US"
        ;;
    eu)
        print_status "=== Applying migration to EU server ==="
        apply_migration "hetzner-primary" "group_vars/hetzner/secrets.yml" "EU"
        ;;
    all)
        print_status "=== Applying migration to ALL servers ==="
        
        print_status "--- US Server ---"
        if apply_migration "interserver-us" "group_vars/interserver/secrets.yml" "US"; then
            us_result="✅ US: Success"
        else
            us_result="❌ US: Failed"
        fi
        
        echo ""
        print_status "--- EU Server ---"
        if apply_migration "hetzner-primary" "group_vars/hetzner/secrets.yml" "EU"; then
            eu_result="✅ EU: Success"
        else
            eu_result="❌ EU: Failed"
        fi
        
        echo ""
        print_status "=== Migration Summary ==="
        echo "$us_result"
        echo "$eu_result"
        ;;
    *)
        print_error "Invalid target: $TARGET"
        echo "Usage: $0 [us|eu|all]"
        exit 1
        ;;
esac