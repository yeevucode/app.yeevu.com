// js/authUtils.js

// Auth0 Configuration
export const AUTH0_DOMAIN = 'yeevu.us.auth0.com';
export const AUTH0_CLIENT_ID = 'pXvpjzqZFTVZhdV6xNQqer4gGgr6W9g';
export const AUTH0_REDIRECT_URI = 'https://app.yeevu.com/callback/'; // Ensure this matches your Auth0 app and callback/index.html
export const AUTH0_AUDIENCE = 'https://yeevu.us.auth0.com/api/v2/';
export const N8N_SUBSCRIPTION_API = 'https://n8n.tomiwa.io/webhook/api/user/subscription';

let currentUser = null; // Centralized user state

/**
 * Initiates the Auth0 login flow.
 * @param {string} returnToPath - The path within the application to return to after successful login (e.g., '/web-prompter/').
 */
export function login(returnToPath = '/') {
    const state = encodeURIComponent(returnToPath);
    window.location.href = `https://${AUTH0_DOMAIN}/authorize?response_type=token&client_id=${AUTH0_CLIENT_ID}&redirect_uri=${AUTH0_REDIRECT_URI}&scope=openid profile email&audience=${AUTH0_AUDIENCE}&state=${state}`;
}

/**
 * Initiates the Auth0 signup flow.
 * @param {string} returnToPath - The path within the application to return to after successful signup (e.g., '/web-prompter/').
 */
export function signup(returnToPath = '/') {
    const state = encodeURIComponent(returnToPath);
    window.location.href = `https://${AUTH0_DOMAIN}/authorize?response_type=token&client_id=${AUTH0_CLIENT_ID}&redirect_uri=${AUTH0_REDIRECT_URI}&scope=openid profile email&audience=${AUTH0_AUDIENCE}&screen_hint=signup&state=${state}`;
}

/**
 * Redirects to the subscription portal.
 */
export function redirectToSubscribe() {
    window.location.href = 'https://portal.tkwebhosts.com/cart.php';
}

/**
 * Handles checking for and storing the Auth0 token from the URL hash.
 * @returns {string|null} The access token if found, otherwise null.
 */
export function handleTokenFromHash() {
    const hash = window.location.hash;
    if (hash.includes('access_token')) {
        const params = new URLSearchParams(hash.replace('#', ''));
        const token = params.get('access_token');
        if (token) {
            localStorage.setItem('token', token);
            window.location.hash = ''; // Clear hash to prevent re-processing
            return token;
        }
    }
    return localStorage.getItem('token');
}

/**
 * Fetches the user's subscription status from the N8N webhook.
 * Updates the centralized `currentUser` variable.
 * @returns {Promise<object|null>} A promise that resolves to the user object or null.
 */
export async function checkSubscription() {
    const token = localStorage.getItem('token');
    if (!token) {
        currentUser = null;
        console.log('authUtils: checkSubscription: No token found, user is not logged in.');
        return null;
    }

    try {
        const response = await fetch(N8N_SUBSCRIPTION_API, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.status === 401) {
            console.log('authUtils: checkSubscription: 401 Unauthorized. Token invalid or expired. Clearing token.');
            localStorage.removeItem('token');
            currentUser = null;
            return null;
        }

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`authUtils: Subscription API fetch failed: ${response.status} - ${errorText}`);
        }

        const data = await response.json(); // This is the data from N8N
        
        // --- CRITICAL CHANGE HERE: Assign the correct property to subscriptionTier ---
        currentUser = {
            ...data, // Spread existing data (sub, email, name, picture)
            subscriptionTier: data.subscriptionList // Use 'subscriptionList' as the tier property
        };
        // --- END CRITICAL CHANGE ---

        console.log('authUtils: User subscription data fetched and parsed:', currentUser);
        return currentUser;
    } catch (error) {
        console.error('authUtils: Subscription check error:', error);
        localStorage.removeItem('token'); // Clear token on network/API errors
        currentUser = null;
        return null;
    }
}

/**
 * Retrieves the current user object.
 * @returns {object|null} The current user object.
 */
export function getCurrentUser() {
    return currentUser;
}