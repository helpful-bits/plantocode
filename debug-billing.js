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
    
    console.log('Testing subscription details...');
    const subscriptionResult = await fetch('ipc://localhost/get_subscription_details_command', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: '{}'
    });
    console.log('Subscription details result:', subscriptionResult);
    
  } catch (error) {
    console.error('Error testing endpoints:', error);
  }
}

testEndpoints();