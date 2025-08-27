// utils.jsx
export const getApiBase = () => {
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:8000';
  }
  return window.location.origin;
};

// Enhanced response handler with better error handling
export const handleResponse = async (response) => {
  const contentType = response.headers.get('content-type');
  let responseData;
  
  try {
    if (contentType && contentType.includes('application/json')) {
      responseData = await response.json();
    } else {
      responseData = await response.text();
    }
  } catch (error) {
    console.error('Failed to parse response:', error);
    responseData = `Failed to parse response: ${error.message}`;
  }
  
  return { response, data: responseData };
};

// Check connection status
export const checkStatus = async (setConnectionStatus, setDebugInfo) => {
  try {
    const apiBase = getApiBase();
    setDebugInfo(`Checking: ${apiBase}/health`);
    
    const healthResponse = await fetch(`${apiBase}/health`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10000)
    });

    const { response, data } = await handleResponse(healthResponse);

    if (response.ok) {
      setConnectionStatus('connected');
      setDebugInfo(`Connected: ${JSON.stringify(data)}`);
    } else {
      setConnectionStatus('disconnected');
      setDebugInfo(`Health check failed: ${response.status} - ${typeof data === 'string' ? data : JSON.stringify(data)}`);
    }
  } catch (error) {
    console.error('Status check failed:', error);
    setConnectionStatus('disconnected');
    setDebugInfo(`Connection error: ${error.message}`);
  }
};