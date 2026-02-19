// web-prompter/script.js

// Import common utilities from the centralized common.js file
import {
    displayMessage,
    login,
    signup,
    subscribe,
    initApp
} from '../js/common.js';

document.addEventListener('DOMContentLoaded', () => {
    let user = null; // This will hold user and subscription data from N8N (now includes subscriptionList)

    // --- DOM Elements ---
    const loginPrompt = document.getElementById('loginPrompt');
    const paywallOverlay = document.getElementById('paywallOverlay');
    const mainContent = document.getElementById('mainContent'); // The wrapper div for your forms
    const webhookResponseTextarea = document.getElementById('webhook-response');

    // --- Paywall & Access Control Logic ---

    // Define the subscription codes required for Prompt Generator access
    const REQUIRED_SUBSCRIPTIONS = ['wd-basic', 'wd-premium', 'wd-lifetime'];

    function isRestricted() {
        // If user is not logged in, or has no subscriptionList, or subscriptionList is empty, restrict access.
        if (!user || !Array.isArray(user.subscriptionList) || user.subscriptionList.length === 0) {
            console.log('Restriction: Prompt Generator requires login or an active subscription.');
            return true;
        }

        const userSubscriptions = user.subscriptionList;

        // Check if the user has ANY of the required subscriptions
        const hasAccess = REQUIRED_SUBSCRIPTIONS.some(requiredCode => userSubscriptions.includes(requiredCode));

        if (!hasAccess) {
            console.log(`Restriction: Prompt Generator requires one of [${REQUIRED_SUBSCRIPTIONS.join(', ')}]. User subscriptions: [${userSubscriptions.join(', ')}]`);
            return true;
        }

        return false; // User has access
    }

    function updateUIAccess() {
        // Hide all elements by default
        loginPrompt.style.display = 'none';
        paywallOverlay.style.display = 'none';
        mainContent.style.display = 'none';
        displayMessage(''); // Clear any messages

        if (!user) {
            // User not logged in
            loginPrompt.style.display = 'block';
            console.log('UI State: Showing Login Prompt.');
        } else {
            // User is logged in, check if their subscription allows access
            if (isRestricted()) {
                paywallOverlay.style.display = 'flex'; // Use 'flex' for overlay to center content
                displayMessage('You are logged in, but your current subscription does not include access to the Prompt Generator. Please upgrade your plan.', 'info');
                console.log('UI State: User logged in, but subscription is insufficient. Showing Paywall.');
            } else {
                // User is logged in and has sufficient subscription
                mainContent.style.display = 'block';
                console.log('UI State: User logged in and subscribed. Showing Main Content.');
            }
        }
    }

    // --- Form Submission Logic ---

    async function handleFormSubmit(event, formElement) {
        event.preventDefault();

        // Re-check status before submission
        if (isRestricted()) {
            displayMessage('To use the Prompt Generator, please upgrade your subscription.', 'error');
            paywallOverlay.style.display = 'flex'; // Use 'flex' for overlay
            return;
        }

        const formData = new FormData(formElement);
        const data = {};
        formData.forEach((value, key) => {
            data[key] = value;
        });

        try {
            const token = localStorage.getItem('token');
            // If token is missing for a form that requires it, redirect to login
            if (!token) {
                displayMessage('You must be logged in to submit this form. Please sign in.', 'error');
                loginPrompt.style.display = 'block';
                mainContent.style.display = 'none';
                return;
            }

            displayMessage('Submitting...', 'info');
            webhookResponseTextarea.value = '';
            webhookResponseTextarea.style.display = 'none'; // Hide until populated

            // Use the specific form's action URL for submission
            const response = await fetch(formElement.action, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` // Send Auth0 token to N8N
                },
                body: JSON.stringify(data),
            });

            if (response.status === 403) { // Forbidden - likely subscription tier issue
                displayMessage('Unauthorized: Your current subscription does not allow submission for this plan. Please upgrade.', 'error');
                paywallOverlay.style.display = 'flex'; // Use 'flex' for overlay
                return;
            }
            if (response.status === 401) { // Unauthorized - token invalid/expired
                displayMessage('Authentication failed. Your session may have expired. Please log in again.', 'error'); // More explicit message
                localStorage.removeItem('token'); // Clear invalid token
                user = null; // Reset user state
                updateUIAccess(); // Re-render UI to show login prompt
                return;
            }

            if (response.ok) {
                const result = await response.json();
                webhookResponseTextarea.value = JSON.stringify(result, null, 2); // For debugging
                webhookResponseTextarea.style.display = 'block'; // Show response box

                if (result.status === 'success') {
                    displayMessage(result.message || 'Form submitted successfully!', 'success');
                    formElement.reset(); // Clear the form on successful submission
                } else {
                    displayMessage(result.message || 'An error occurred during processing.', 'error');
                }
            } else {
                let errorText = await response.text();
                try {
                    const errorJson = JSON.parse(errorText);
                    errorText = errorJson.message || errorText;
                } catch (e) { /* not JSON, use raw text */ }
                displayMessage(`Submission failed: ${response.status} ${response.statusText}. ${errorText}`, 'error');
            }
        } catch (error) {
            displayMessage('Network Error: Could not connect to the server. Please try again.', 'error');
            webhookResponseTextarea.value = 'Error: ' + error.message; // For detailed debug
            webhookResponseTextarea.style.display = 'block';
        }
    }

    // Attach submit listener to the form
    document.getElementById('form-professional')?.addEventListener('submit', (e) => handleFormSubmit(e, e.target));

    // Event Listeners for login/signup/subscribe buttons
    const loginBtn = document.getElementById('loginBtn');
    const signupBtn = document.getElementById('signupBtn');
    const subscribeBtn = document.getElementById('subscribeBtn');

    if (loginBtn) {
        loginBtn.addEventListener('click', login);
    }
    if (signupBtn) {
        signupBtn.addEventListener('click', signup);
    }
    if (subscribeBtn) {
        subscribeBtn.addEventListener('click', subscribe);
    }

    // Close paywall overlay when clicking outside content
    if (paywallOverlay) {
        paywallOverlay.addEventListener('click', (e) => {
            if (e.target === paywallOverlay) {
                paywallOverlay.style.display = 'none';
                displayMessage(''); // Clear message when closing overlay
            }
        });
    }

    // --- App Initialization ---
    initApp({
        showLoadingOnInit: true,
        onUserLoaded: (userData) => {
            user = userData;
            updateUIAccess();
        }
    });
});