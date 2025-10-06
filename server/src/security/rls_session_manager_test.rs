#[cfg(test)]
mod tests {
    use crate::security::rls_session_manager::RLSSessionManager;
    use bigdecimal::{BigDecimal, FromPrimitive};
    use sqlx::{PgPool, Row};
    use std::env;
    use uuid::Uuid;

    /// Test database pool creation for security testing
    async fn create_test_pool() -> PgPool {
        let database_url =
            env::var("DATABASE_URL").expect("DATABASE_URL must be set for RLS security tests");
        PgPool::connect(&database_url)
            .await
            .expect("Failed to connect to test database for RLS security tests")
    }

    /// Helper function to create a test user in the database
    async fn create_test_user(
        pool: &PgPool,
        user_id: Uuid,
        email: &str,
    ) -> Result<(), sqlx::Error> {
        sqlx::query("INSERT INTO users (id, email, role) VALUES ($1, $2, 'user')")
            .bind(user_id)
            .bind(email)
            .execute(pool)
            .await?;
        Ok(())
    }

    /// Helper function to create user credit balance
    async fn create_user_credits(
        pool: &PgPool,
        user_id: Uuid,
        balance: BigDecimal,
    ) -> Result<(), sqlx::Error> {
        sqlx::query("INSERT INTO user_credits (user_id, balance) VALUES ($1, $2)")
            .bind(user_id)
            .bind(balance)
            .execute(pool)
            .await?;
        Ok(())
    }

    /// Helper function to create credit transaction
    async fn create_credit_transaction(
        pool: &PgPool,
        user_id: Uuid,
        transaction_type: &str,
        amount: BigDecimal,
        balance_after: BigDecimal,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "INSERT INTO credit_transactions (user_id, transaction_type, net_amount, gross_amount, fee_amount, balance_after) VALUES ($1, $2, $3, $4, $5, $6)"
        )
        .bind(user_id)
        .bind(transaction_type)
        .bind(amount.clone())
        .bind(amount)
        .bind(BigDecimal::from(0))
        .bind(balance_after)
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Helper function to cleanup test data
    async fn cleanup_test_data(pool: &PgPool, user_ids: &[Uuid]) -> Result<(), sqlx::Error> {
        // Delete in reverse order of dependencies
        for user_id in user_ids {
            let _ = sqlx::query("DELETE FROM credit_transactions WHERE user_id = $1")
                .bind(user_id)
                .execute(pool)
                .await;
            let _ = sqlx::query("DELETE FROM user_credits WHERE user_id = $1")
                .bind(user_id)
                .execute(pool)
                .await;
            let _ = sqlx::query("DELETE FROM users WHERE id = $1")
                .bind(user_id)
                .execute(pool)
                .await;
        }
        Ok(())
    }

    /// Helper function to set user context in database session
    async fn set_user_context(
        conn: &mut sqlx::PgConnection,
        user_id: Uuid,
    ) -> Result<(), sqlx::Error> {
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(user_id.to_string())
            .execute(conn)
            .await?;
        Ok(())
    }

    /// Critical Test: user_cannot_access_others_billing_data
    /// This test ensures that users cannot access other users' billing information
    /// under any circumstances, which is fundamental to data security and privacy.
    #[tokio::test]
    async fn user_cannot_access_others_billing_data() {
        if env::var("DATABASE_URL").is_err() {
            eprintln!("Skipping RLS security test: DATABASE_URL not set");
            return;
        }

        let pool = create_test_pool().await;
        let manager = RLSSessionManager::new(pool.clone());

        // Create two test users
        let user_1_id = Uuid::new_v4();
        let user_2_id = Uuid::new_v4();
        let user_1_email = format!("test_user_1_{}@example.com", user_1_id);
        let user_2_email = format!("test_user_2_{}@example.com", user_2_id);

        // Setup test data
        create_test_user(&pool, user_1_id, &user_1_email)
            .await
            .unwrap();
        create_test_user(&pool, user_2_id, &user_2_email)
            .await
            .unwrap();

        let balance_1 = BigDecimal::from_f64(100.0000).unwrap(); // 100.0000
        let balance_2 = BigDecimal::from_f64(200.0000).unwrap(); // 200.0000

        create_user_credits(&pool, user_1_id, balance_1.clone())
            .await
            .unwrap();
        create_user_credits(&pool, user_2_id, balance_2.clone())
            .await
            .unwrap();

        // Test 1: User 1 should only see their own credit balance
        let mut conn_1 = manager
            .get_connection_with_user_context(user_1_id, Some("test_req_1".to_string()))
            .await
            .expect("Failed to get connection with user 1 context");

        // Verify user 1 can see their own balance
        let user_1_balance = sqlx::query_scalar::<_, BigDecimal>(
            "SELECT balance FROM user_credits WHERE user_id = $1",
        )
        .bind(user_1_id)
        .fetch_one(&mut *conn_1)
        .await
        .expect("User 1 should be able to access their own credit balance");

        assert_eq!(
            user_1_balance,
            balance_1.clone(),
            "User 1 should see their correct balance"
        );

        // Critical Security Test: User 1 should NOT see user 2's balance
        let user_2_balance_access = sqlx::query_scalar::<_, BigDecimal>(
            "SELECT balance FROM user_credits WHERE user_id = $1",
        )
        .bind(user_2_id)
        .fetch_optional(&mut *conn_1)
        .await
        .expect("Query should execute without error");

        assert!(
            user_2_balance_access.is_none(),
            "CRITICAL SECURITY FAILURE: User 1 can access User 2's credit balance! RLS policy is not working."
        );

        // Critical Security Test: User 1 should only see 1 total record (their own)
        let total_visible_records =
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM user_credits")
                .fetch_one(&mut *conn_1)
                .await
                .expect("Count query should execute");

        assert_eq!(
            total_visible_records, 1,
            "CRITICAL SECURITY FAILURE: User 1 can see {} records instead of 1. Cross-user data access detected!",
            total_visible_records
        );

        // Test 2: User 2 should only see their own credit balance
        let mut conn_2 = manager
            .get_connection_with_user_context(user_2_id, Some("test_req_2".to_string()))
            .await
            .expect("Failed to get connection with user 2 context");

        // Verify user 2 can see their own balance
        let user_2_own_balance = sqlx::query_scalar::<_, BigDecimal>(
            "SELECT balance FROM user_credits WHERE user_id = $1",
        )
        .bind(user_2_id)
        .fetch_one(&mut *conn_2)
        .await
        .expect("User 2 should be able to access their own credit balance");

        assert_eq!(
            user_2_own_balance,
            balance_2.clone(),
            "User 2 should see their correct balance"
        );

        // Critical Security Test: User 2 should NOT see user 1's balance
        let user_1_balance_access = sqlx::query_scalar::<_, BigDecimal>(
            "SELECT balance FROM user_credits WHERE user_id = $1",
        )
        .bind(user_1_id)
        .fetch_optional(&mut *conn_2)
        .await
        .expect("Query should execute without error");

        assert!(
            user_1_balance_access.is_none(),
            "CRITICAL SECURITY FAILURE: User 2 can access User 1's credit balance! RLS policy is not working."
        );

        // Cleanup
        cleanup_test_data(&pool, &[user_1_id, user_2_id])
            .await
            .unwrap();

        println!(
            "✓ PASSED: user_cannot_access_others_billing_data - Users cannot access other users' billing data"
        );
    }

    /// Test: RLS policy enforcement for credit transactions
    /// Verifies that users can only access their own credit transaction history
    #[tokio::test]
    async fn test_credit_transactions_rls_enforcement() {
        if env::var("DATABASE_URL").is_err() {
            eprintln!("Skipping RLS security test: DATABASE_URL not set");
            return;
        }

        let pool = create_test_pool().await;
        let manager = RLSSessionManager::new(pool.clone());

        // Create two test users
        let user_1_id = Uuid::new_v4();
        let user_2_id = Uuid::new_v4();
        let user_1_email = format!("test_user_1_{}@example.com", user_1_id);
        let user_2_email = format!("test_user_2_{}@example.com", user_2_id);

        // Setup test data
        create_test_user(&pool, user_1_id, &user_1_email)
            .await
            .unwrap();
        create_test_user(&pool, user_2_id, &user_2_email)
            .await
            .unwrap();

        let balance_1 = BigDecimal::from_f64(100.0000).unwrap(); // 100.0000
        let balance_2 = BigDecimal::from_f64(200.0000).unwrap(); // 200.0000
        let transaction_amount = BigDecimal::from_f64(50.0000).unwrap(); // 50.0000

        create_user_credits(&pool, user_1_id, balance_1.clone())
            .await
            .unwrap();
        create_user_credits(&pool, user_2_id, balance_2.clone())
            .await
            .unwrap();

        create_credit_transaction(
            &pool,
            user_1_id,
            "purchase",
            transaction_amount.clone(),
            &balance_1 + &transaction_amount,
        )
        .await
        .unwrap();
        create_credit_transaction(
            &pool,
            user_2_id,
            "purchase",
            transaction_amount.clone(),
            &balance_2 + &transaction_amount,
        )
        .await
        .unwrap();

        // Test: User 1 should only see their own transactions
        let mut conn_1 = manager
            .get_connection_with_user_context(user_1_id, Some("test_req_tx_1".to_string()))
            .await
            .expect("Failed to get connection with user 1 context");

        // Verify user 1 can see their own transaction
        let user_1_transactions = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM credit_transactions WHERE user_id = $1",
        )
        .bind(user_1_id)
        .fetch_one(&mut *conn_1)
        .await
        .expect("User 1 should be able to access their own transactions");

        assert_eq!(
            user_1_transactions, 1,
            "User 1 should see exactly 1 transaction"
        );

        // Critical Security Test: User 1 should NOT see user 2's transactions
        let user_2_transactions_access = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM credit_transactions WHERE user_id = $1",
        )
        .bind(user_2_id)
        .fetch_one(&mut *conn_1)
        .await
        .expect("Query should execute without error");

        assert_eq!(
            user_2_transactions_access, 0,
            "CRITICAL SECURITY FAILURE: User 1 can access User 2's credit transactions! RLS policy is not working."
        );

        // Critical Security Test: User 1 should only see 1 total transaction record
        let total_visible_transactions =
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM credit_transactions")
                .fetch_one(&mut *conn_1)
                .await
                .expect("Count query should execute");

        assert_eq!(
            total_visible_transactions, 1,
            "CRITICAL SECURITY FAILURE: User 1 can see {} transaction records instead of 1. Cross-user data access detected!",
            total_visible_transactions
        );

        // Cleanup
        cleanup_test_data(&pool, &[user_1_id, user_2_id])
            .await
            .unwrap();

        println!(
            "✓ PASSED: test_credit_transactions_rls_enforcement - Users cannot access other users' credit transactions"
        );
    }

    /// Test: RLS policy enforcement for INSERT operations
    /// Verifies that users cannot insert data for other users
    #[tokio::test]
    async fn test_rls_insert_operations_blocked() {
        if env::var("DATABASE_URL").is_err() {
            eprintln!("Skipping RLS security test: DATABASE_URL not set");
            return;
        }

        let pool = create_test_pool().await;
        let manager = RLSSessionManager::new(pool.clone());

        // Create two test users
        let user_1_id = Uuid::new_v4();
        let user_2_id = Uuid::new_v4();
        let user_1_email = format!("test_user_1_{}@example.com", user_1_id);
        let user_2_email = format!("test_user_2_{}@example.com", user_2_id);

        // Setup test data
        create_test_user(&pool, user_1_id, &user_1_email)
            .await
            .unwrap();
        create_test_user(&pool, user_2_id, &user_2_email)
            .await
            .unwrap();

        // Test: User 1 context trying to insert credit balance for User 2 (should fail)
        let mut conn_1 = manager
            .get_connection_with_user_context(user_1_id, Some("test_req_insert_1".to_string()))
            .await
            .expect("Failed to get connection with user 1 context");

        let insert_result =
            sqlx::query("INSERT INTO user_credits (user_id, balance) VALUES ($1, $2)")
                .bind(user_2_id)
                .bind(BigDecimal::from_f64(100.0000).unwrap())
                .execute(&mut *conn_1)
                .await;

        assert!(
            insert_result.is_err(),
            "CRITICAL SECURITY FAILURE: User 1 was able to insert credit data for User 2! RLS WITH CHECK policy is not working."
        );

        // Test: User 1 context trying to insert transaction for User 2 (should fail)
        let transaction_insert_result = sqlx::query(
            "INSERT INTO credit_transactions (user_id, transaction_type, net_amount, gross_amount, fee_amount, balance_after) VALUES ($1, 'purchase', $2, $3, $4, $5)"
        )
        .bind(user_2_id)
        .bind(BigDecimal::from_f64(50.0000).unwrap())
        .bind(BigDecimal::from_f64(50.0000).unwrap())
        .bind(BigDecimal::from(0))
        .bind(BigDecimal::from_f64(100.0000).unwrap())
        .execute(&mut *conn_1)
        .await;

        assert!(
            transaction_insert_result.is_err(),
            "CRITICAL SECURITY FAILURE: User 1 was able to insert transaction data for User 2! RLS WITH CHECK policy is not working."
        );

        // Verify User 1 can still insert their own data
        let own_insert_result =
            sqlx::query("INSERT INTO user_credits (user_id, balance) VALUES ($1, $2)")
                .bind(user_1_id)
                .bind(BigDecimal::from_f64(150.0000).unwrap())
                .execute(&mut *conn_1)
                .await;

        assert!(
            own_insert_result.is_ok(),
            "User 1 should be able to insert their own credit data"
        );

        // Cleanup
        cleanup_test_data(&pool, &[user_1_id, user_2_id])
            .await
            .unwrap();

        println!(
            "✓ PASSED: test_rls_insert_operations_blocked - INSERT operations are properly restricted by RLS"
        );
    }

    /// Test: Context validation and session leakage prevention
    /// Verifies that the RLS session manager properly validates user context
    #[tokio::test]
    async fn test_context_validation_and_session_isolation() {
        if env::var("DATABASE_URL").is_err() {
            eprintln!("Skipping RLS security test: DATABASE_URL not set");
            return;
        }

        let pool = create_test_pool().await;
        let manager = RLSSessionManager::new(pool.clone());

        // Create test user
        let user_1_id = Uuid::new_v4();
        let user_1_email = format!("test_user_1_{}@example.com", user_1_id);

        create_test_user(&pool, user_1_id, &user_1_email)
            .await
            .unwrap();

        // Test: Get connection with proper user context
        let mut conn_1 = manager
            .get_connection_with_user_context(user_1_id, Some("test_req_context_1".to_string()))
            .await
            .expect("Failed to get connection with user context");

        // Verify the connection has correct user context
        let validation_result = manager
            .validate_connection_context(&mut conn_1, user_1_id)
            .await;

        assert!(
            validation_result.is_ok(),
            "Connection context validation should pass for correct user ID: {:?}",
            validation_result
        );

        // Test: Validate connection context with wrong user ID (should fail)
        let wrong_user_id = Uuid::new_v4();
        let wrong_validation_result = manager
            .validate_connection_context(&mut conn_1, wrong_user_id)
            .await;

        assert!(
            wrong_validation_result.is_err(),
            "CRITICAL SECURITY FAILURE: Connection context validation passed for wrong user ID! Session leakage detected."
        );

        // Test: Verify get_current_user_id() function returns correct value
        let current_user_result =
            sqlx::query_scalar::<_, Option<Uuid>>("SELECT get_current_user_id()")
                .fetch_one(&mut *conn_1)
                .await
                .expect("get_current_user_id() should execute successfully");

        match current_user_result {
            Some(current_user_id) => {
                assert_eq!(
                    current_user_id, user_1_id,
                    "get_current_user_id() should return the correct user ID"
                );
            }
            None => {
                panic!(
                    "CRITICAL SECURITY FAILURE: get_current_user_id() returned NULL! RLS policies will fail."
                );
            }
        }

        // Cleanup
        cleanup_test_data(&pool, &[user_1_id]).await.unwrap();

        println!(
            "✓ PASSED: test_context_validation_and_session_isolation - Context validation and session isolation working correctly"
        );
    }

    /// Test: Direct session variable access (the core security requirement)
    /// Verifies that RLS policies correctly use current_setting('app.current_user_id')
    #[tokio::test]
    async fn test_direct_session_variable_access() {
        if env::var("DATABASE_URL").is_err() {
            eprintln!("Skipping RLS security test: DATABASE_URL not set");
            return;
        }

        let pool = create_test_pool().await;
        let mut raw_conn = pool.acquire().await.expect("Failed to acquire connection");

        // Create test users
        let user_1_id = Uuid::new_v4();
        let user_2_id = Uuid::new_v4();

        sqlx::query(
            "INSERT INTO users (id, email, role) VALUES ($1, $2, 'user'), ($3, $4, 'user')",
        )
        .bind(user_1_id)
        .bind(format!("test_user_1_{}@example.com", user_1_id))
        .bind(user_2_id)
        .bind(format!("test_user_2_{}@example.com", user_2_id))
        .execute(&mut *raw_conn)
        .await
        .expect("Failed to create test users");

        // Create credit data for both users
        sqlx::query("INSERT INTO user_credits (user_id, balance) VALUES ($1, $2), ($3, $4)")
            .bind(user_1_id)
            .bind(BigDecimal::from_f64(100.0000).unwrap())
            .bind(user_2_id)
            .bind(BigDecimal::from_f64(200.0000).unwrap())
            .execute(&mut *raw_conn)
            .await
            .expect("Failed to create test credit data");

        // Test 1: Set session variable for user 1 and verify RLS works
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(user_1_id.to_string())
            .execute(&mut *raw_conn)
            .await
            .expect("Failed to set session variable");

        // Verify session variable is set correctly
        let session_var_value =
            sqlx::query_scalar::<_, String>("SELECT current_setting('app.current_user_id')")
                .fetch_one(&mut *raw_conn)
                .await
                .expect("Failed to get session variable");

        assert_eq!(
            session_var_value,
            user_1_id.to_string(),
            "Session variable should be set to user 1 ID"
        );

        // Test the RLS policy directly using the session variable
        let visible_credits = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM user_credits WHERE user_id::text = current_setting('app.current_user_id')"
        )
        .fetch_one(&mut *raw_conn)
        .await
        .expect("Direct session variable query should work");

        assert_eq!(
            visible_credits, 1,
            "Direct session variable access should show exactly 1 record for user 1"
        );

        // Test RLS policy through table access (should only show user 1's data)
        let rls_filtered_count = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM user_credits")
            .fetch_one(&mut *raw_conn)
            .await
            .expect("RLS filtered query should work");

        assert_eq!(
            rls_filtered_count, 1,
            "CRITICAL SECURITY FAILURE: RLS policy using current_setting('app.current_user_id') is not working correctly. Expected 1 record, got {}",
            rls_filtered_count
        );

        // Test 2: Change context to user 2 and verify isolation
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(user_2_id.to_string())
            .execute(&mut *raw_conn)
            .await
            .expect("Failed to change session variable to user 2");

        let user_2_visible_count =
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM user_credits")
                .fetch_one(&mut *raw_conn)
                .await
                .expect("RLS filtered query for user 2 should work");

        assert_eq!(
            user_2_visible_count, 1,
            "CRITICAL SECURITY FAILURE: User 2 context should only see 1 record (their own), but sees {}",
            user_2_visible_count
        );

        // Verify user 2 sees their own balance, not user 1's
        let user_2_balance =
            sqlx::query_scalar::<_, BigDecimal>("SELECT balance FROM user_credits LIMIT 1")
                .fetch_one(&mut *raw_conn)
                .await
                .expect("User 2 should see their balance");

        let expected_user_2_balance = BigDecimal::from_f64(200.0000).unwrap();
        assert_eq!(
            user_2_balance, expected_user_2_balance,
            "User 2 should see their own balance ({}), not user 1's",
            expected_user_2_balance
        );

        // Cleanup
        cleanup_test_data(&pool, &[user_1_id, user_2_id])
            .await
            .unwrap();

        println!(
            "✓ PASSED: test_direct_session_variable_access - RLS policies correctly use current_setting('app.current_user_id')"
        );
    }

    /// Test: Database built-in RLS security test functions
    /// Runs the SQL-based security tests to verify comprehensive RLS coverage
    #[tokio::test]
    async fn test_database_rls_security_functions() {
        if env::var("DATABASE_URL").is_err() {
            eprintln!("Skipping RLS security test: DATABASE_URL not set");
            return;
        }

        let pool = create_test_pool().await;
        let mut conn = pool.acquire().await.expect("Failed to acquire connection");

        // Run the comprehensive RLS security tests defined in the database
        let test_results = sqlx::query("SELECT * FROM test_rls_billing_security()")
            .fetch_all(&mut *conn)
            .await
            .expect("Failed to run database RLS security tests");

        let mut passed_tests = 0;
        let mut failed_tests = 0;
        let mut critical_failures = 0;

        println!("\n=== Database RLS Security Test Results ===");

        for row in test_results {
            let test_name: String = row.get("test_name");
            let test_result: String = row.get("test_result");
            let test_status: String = row.get("test_status");
            let error_message: Option<String> = row.get("error_message");

            match test_result.as_str() {
                "PASSED" => {
                    passed_tests += 1;
                    println!("✓ PASSED: {}", test_name);
                }
                "FAILED" => {
                    failed_tests += 1;
                    if test_status == "CRITICAL" {
                        critical_failures += 1;
                    }
                    println!(
                        "✗ FAILED: {} - {}",
                        test_name,
                        error_message.unwrap_or("Unknown error".to_string())
                    );
                }
                _ => {
                    println!("? UNKNOWN: {} - {}", test_name, test_result);
                }
            }
        }

        println!("\n=== Test Summary ===");
        println!("Passed: {}", passed_tests);
        println!("Failed: {}", failed_tests);
        println!("Critical Failures: {}", critical_failures);

        // Assert that all tests passed and no critical failures occurred
        assert_eq!(
            critical_failures, 0,
            "CRITICAL SECURITY FAILURES DETECTED: {} critical RLS policy failures found. This indicates serious security vulnerabilities!",
            critical_failures
        );

        assert_eq!(
            failed_tests, 0,
            "RLS SECURITY TEST FAILURES: {} tests failed. All RLS security tests must pass.",
            failed_tests
        );

        assert!(
            passed_tests > 0,
            "No RLS security tests were executed. This indicates a problem with the test setup."
        );

        println!(
            "✓ PASSED: test_database_rls_security_functions - All database RLS security tests passed"
        );
    }

    /// Integration test: Complete RLS security verification
    /// This test combines all security checks into a comprehensive verification
    #[tokio::test]
    async fn test_complete_rls_security_verification() {
        if env::var("DATABASE_URL").is_err() {
            eprintln!("Skipping comprehensive RLS security test: DATABASE_URL not set");
            return;
        }

        println!("\n=== COMPREHENSIVE RLS SECURITY VERIFICATION ===");
        println!("This test verifies complete isolation of billing data between users");

        let pool = create_test_pool().await;
        let manager = RLSSessionManager::new(pool.clone());

        // Create multiple test users to simulate real-world scenarios
        let user_ids: Vec<Uuid> = (0..3).map(|_| Uuid::new_v4()).collect();
        let balances = vec![
            BigDecimal::from_f64(100.0000).unwrap(), // 100.0000
            BigDecimal::from_f64(250.0000).unwrap(), // 250.0000
            BigDecimal::from_f64(500.0000).unwrap(), // 500.0000
        ];

        // Setup test users and data
        for (i, &user_id) in user_ids.iter().enumerate() {
            let email = format!("comprehensive_test_user_{}@example.com", i);
            create_test_user(&pool, user_id, &email).await.unwrap();
            create_user_credits(&pool, user_id, balances[i].clone())
                .await
                .unwrap();

            // Create transaction history
            create_credit_transaction(
                &pool,
                user_id,
                "purchase",
                BigDecimal::from_f64(10.0000).unwrap(), // 10.0000
                &balances[i] + &BigDecimal::from_f64(10.0000).unwrap(),
            )
            .await
            .unwrap();
        }

        // Test each user's isolation
        for (i, &user_id) in user_ids.iter().enumerate() {
            println!("Testing isolation for user {} ({})", i + 1, user_id);

            let mut conn = manager
                .get_connection_with_user_context(
                    user_id,
                    Some(format!("comprehensive_test_{}", i)),
                )
                .await
                .expect("Failed to get connection with user context");

            // Verify user can see their own data
            let own_credit_count = sqlx::query_scalar::<_, i64>(
                "SELECT COUNT(*) FROM user_credits WHERE user_id = $1",
            )
            .bind(user_id)
            .fetch_one(&mut *conn)
            .await
            .expect("User should be able to query their own data");

            assert_eq!(
                own_credit_count,
                1,
                "User {} should see exactly 1 credit record (their own)",
                i + 1
            );

            let own_transaction_count = sqlx::query_scalar::<_, i64>(
                "SELECT COUNT(*) FROM credit_transactions WHERE user_id = $1",
            )
            .bind(user_id)
            .fetch_one(&mut *conn)
            .await
            .expect("User should be able to query their own transactions");

            assert_eq!(
                own_transaction_count,
                1,
                "User {} should see exactly 1 transaction record (their own)",
                i + 1
            );

            // Critical: Verify user can only see their own data (no other users' data)
            let total_visible_credits =
                sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM user_credits")
                    .fetch_one(&mut *conn)
                    .await
                    .expect("Total credit count query should work");

            assert_eq!(
                total_visible_credits,
                1,
                "CRITICAL SECURITY FAILURE: User {} can see {} credit records instead of 1. Cross-user access detected!",
                i + 1,
                total_visible_credits
            );

            let total_visible_transactions =
                sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM credit_transactions")
                    .fetch_one(&mut *conn)
                    .await
                    .expect("Total transaction count query should work");

            assert_eq!(
                total_visible_transactions,
                1,
                "CRITICAL SECURITY FAILURE: User {} can see {} transaction records instead of 1. Cross-user access detected!",
                i + 1,
                total_visible_transactions
            );

            // Verify the balance is correct for this user
            let visible_balance =
                sqlx::query_scalar::<_, BigDecimal>("SELECT balance FROM user_credits LIMIT 1")
                    .fetch_one(&mut *conn)
                    .await
                    .expect("User should be able to see a balance");

            assert_eq!(
                visible_balance,
                balances[i],
                "User {} should see their correct balance ({:?}), not another user's balance",
                i + 1,
                balances[i]
            );

            println!("✓ User {} isolation verified successfully", i + 1);
        }

        // Test context switching security
        println!("Testing context switching security...");
        let mut shared_conn = pool
            .acquire()
            .await
            .expect("Failed to get shared connection");

        // Switch between users and verify each sees only their own data
        for (i, &user_id) in user_ids.iter().enumerate() {
            set_user_context(&mut shared_conn, user_id).await.unwrap();

            let visible_count = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM user_credits")
                .fetch_one(&mut *shared_conn)
                .await
                .expect("Context switch query should work");

            assert_eq!(
                visible_count,
                1,
                "CRITICAL SECURITY FAILURE: After context switch to user {}, {} records are visible instead of 1",
                i + 1,
                visible_count
            );

            let visible_balance =
                sqlx::query_scalar::<_, BigDecimal>("SELECT balance FROM user_credits LIMIT 1")
                    .fetch_one(&mut *shared_conn)
                    .await
                    .expect("User should see their balance after context switch");

            assert_eq!(
                visible_balance,
                balances[i],
                "CRITICAL SECURITY FAILURE: After context switch to user {}, wrong balance visible. Expected {:?}, got {:?}",
                i + 1,
                balances[i],
                visible_balance
            );
        }

        // Cleanup
        cleanup_test_data(&pool, &user_ids).await.unwrap();

        println!(
            "✓ PASSED: test_complete_rls_security_verification - Comprehensive RLS security verification successful"
        );
        println!(
            "✓ ALL SECURITY TESTS PASSED - Row Level Security is properly configured and enforced"
        );
    }
}
