// /js/callback.js
document.addEventListener('DOMContentLoaded', () => {
  console.log('--- callback.js loaded and DOMContentLoaded fired ---');

  // Fallback URL if 'state' is not provided or is invalid
  const FALLBACK_APP_URL = 'https://app.yeevu.com/'; 

  const handleAuthCallback = () => {
      const hash = window.location.hash;
      console.log('Callback JS: Handling hash:', hash);

      const params = new URLSearchParams(hash.replace('#', ''));
      const token = params.get('access_token');
      const state = params.get('state'); // MODIFIED: Retrieve the state parameter

      let redirectTo = FALLBACK_APP_URL; // MODIFIED: Default redirect is the fallback

      if (state) {
          try {
              // MODIFIED: Decode the state parameter. Ensure it's a valid path.
              const decodedState = decodeURIComponent(state);
              // Simple validation: make sure it starts with a '/' to prevent open redirect vulnerabilities
              if (decodedState.startsWith('/')) {
                  redirectTo = `https://app.yeevu.com${decodedState}`; // Reconstruct the full URL
              } else {
                  console.warn('Callback JS: Invalid state parameter, redirecting to fallback URL.');
              }
          } catch (e) {
              console.error('Callback JS: Error decoding state parameter:', e);
          }
      }

      if (token) {
          localStorage.setItem('token', token);
          console.log('Callback JS: Token stored in localStorage.');
          window.location.hash = ''; // Clear the hash from the URL
          console.log('Callback JS: Redirecting to:', redirectTo);
          window.location.href = redirectTo;
      } else {
          console.warn('Callback JS: No access token found in hash. Redirecting to:', redirectTo);
          window.location.href = redirectTo;
      }
  };

  handleAuthCallback();
});