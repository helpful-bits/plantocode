// Debug script to test billing endpoints directly
console.log('Testing billing endpoints...');

// Test the endpoints directly to see what's happening
async function testEndpoints() {
  try {
    console.log('Testing spending status...');
    const spendingResult = await fetch('ipc://localhost/get_spending_status_command', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: '{}'
    });
    console.log('Spending status result:', spendingResult);
    
    console.log('Testing billing dashboard data...');
    const dashboardResult = await fetch('ipc://localhost/get_billing_dashboard_data_command', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: '{}'
    });
    console.log('Billing dashboard data result:', dashboardResult);
    
  } catch (error) {
    console.error('Error testing endpoints:', error);
  }
}

testEndpoints();