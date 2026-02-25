// js/common.js

// --- Debug Logging to localStorage ---
const LOG_STORAGE_KEY = 'yeevu_debug_logs';
const MAX_LOG_ENTRIES = 50; // Keep last 50 entries to avoid localStorage bloat

export function logToStorage(context, message, data = null) {
    try {
        const logs = JSON.parse(localStorage.getItem(LOG_STORAGE_KEY) || '[]');
        const entry = {
            timestamp: new Date().toISOString(),
            context: context,
            message: message,
            data: data,
            url: window.location.href
        };
        logs.push(entry);
        // Keep only the last MAX_LOG_ENTRIES
        if (logs.length > MAX_LOG_ENTRIES) {
            logs.splice(0, logs.length - MAX_LOG_ENTRIES);
        }
        localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(logs));
        console.log(`[LOG] ${context}: ${message}`, data || '');
    } catch (e) {
        console.error('Failed to write to log storage:', e);
    }
}

export function getStorageLogs() {
    try {
        return JSON.parse(localStorage.getItem(LOG_STORAGE_KEY) || '[]');
    } catch (e) {
        return [];
    }
}

export function clearStorageLogs() {
    localStorage.removeItem(LOG_STORAGE_KEY);
    console.log('Debug logs cleared');
}

function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Universal function to display messages
export function displayMessage(message, type = 'info') {
    const formMessageDiv = document.getElementById('form-message');
    if (!formMessageDiv) {
        console.error('Error: form-message div not found! Please ensure your HTML includes <div id="form-message"></div>');
        // Fallback to console.log if the message div isn't found
        console.log(`Message (${type}): ${message}`); 
        return;
    }
    formMessageDiv.textContent = message;
    formMessageDiv.style.display = 'block';
    formMessageDiv.style.backgroundColor = ''; // Reset
    formMessageDiv.style.color = ''; // Reset
    formMessageDiv.style.border = ''; // Reset
    formMessageDiv.style.padding = '10px'; // Ensure padding
    formMessageDiv.style.borderRadius = '5px'; // Add some styling

    if (type === 'success') {
        formMessageDiv.style.backgroundColor = '#d4edda'; /* Light green */
        formMessageDiv.style.color = '#155724'; /* Dark green */
        formMessageDiv.style.borderColor = '#c3e6cb';
    } else if (type === 'error') {
        formMessageDiv.style.backgroundColor = '#f8d7da'; /* Light red */
        formMessageDiv.style.color = '#721c24'; /* Dark red */
        formMessageDiv.style.borderColor = '#f5c6cb';
    } else { /* info */
        formMessageDiv.style.backgroundColor = '#e2e3e5'; /* Light gray */
        formMessageDiv.style.color = '#383d41'; /* Dark gray */
        formMessageDiv.style.borderColor = '#d6d8db';
    }
}

// Auth0 configuration
export const AUTH0_DOMAIN = 'auth.yeevu.com';
export const AUTH0_CLIENT_ID = 'pXvpjzqZFTVZhdV6xXNQqer4gGgr6W9g';
export const AUTH0_REDIRECT_URI = 'https://app.yeevu.com/callback/'; // IMPORTANT: Ensure trailing slash if it's a directory
export const AUTH0_AUDIENCE = 'https://yeevu.us.auth0.com/api/v2/';

// --- Auth Actions ---
export function login() {
    const returnToPath = window.location.pathname + window.location.search;
    logToStorage('login', 'Initiating login redirect', { returnToPath: returnToPath });
    displayMessage('Redirecting to login page...', 'info');
    window.location.href = `https://${AUTH0_DOMAIN}/authorize?response_type=token&client_id=${AUTH0_CLIENT_ID}&redirect_uri=${AUTH0_REDIRECT_URI}&scope=openid profile email&audience=${AUTH0_AUDIENCE}&state=${encodeURIComponent(returnToPath)}`;
}

export function signup() {
    const returnToPath = window.location.pathname + window.location.search;
    logToStorage('signup', 'Initiating signup redirect', { returnToPath: returnToPath });
    displayMessage('Redirecting to signup page...', 'info');
    window.location.href = `https://${AUTH0_DOMAIN}/authorize?response_type=token&client_id=${AUTH0_CLIENT_ID}&redirect_uri=${AUTH0_REDIRECT_URI}&scope=openid profile email&audience=${AUTH0_AUDIENCE}&screen_hint=signup&state=${encodeURIComponent(returnToPath)}`;
}

export function subscribe() {
    displayMessage('Redirecting to subscription page...', 'info');
    window.location.href = 'https://portal.tkwebhosts.com/cart.php';
}

export function logout() {
    logToStorage('logout', 'User logging out');
    localStorage.removeItem('token');
    // Redirect to Auth0 logout, then back to app
    window.location.href = `https://${AUTH0_DOMAIN}/v2/logout?client_id=${AUTH0_CLIENT_ID}&returnTo=${encodeURIComponent('https://app.yeevu.com/')}`;
}

// --- Loading State ---
export function showLoading(message = 'Loading...') {
    let loader = document.getElementById('yeevu-loader');
    if (!loader) {
        loader = document.createElement('div');
        loader.id = 'yeevu-loader';
        loader.innerHTML = `
            <div class="yeevu-loader-content">
                <div class="yeevu-spinner"></div>
                <p id="yeevu-loader-message">${message}</p>
            </div>
        `;
        document.body.appendChild(loader);
    } else {
        document.getElementById('yeevu-loader-message').textContent = message;
        loader.style.display = 'flex';
    }
}

export function hideLoading() {
    const loader = document.getElementById('yeevu-loader');
    if (loader) {
        loader.style.display = 'none';
    }
}

// --- Unified Navigation Header ---
export function initHeader(user = null) {
    const existingHeader = document.getElementById('yeevu-nav');
    if (existingHeader) existingHeader.remove();

    const nav = document.createElement('nav');
    nav.id = 'yeevu-nav';
    nav.className = 'yeevu-nav';

    const isHome = window.location.pathname === '/' || window.location.pathname === '/index.html';

    const safeEmail = escapeHtml(user?.email || 'User');

    nav.innerHTML = `
        <div class="yeevu-nav-inner">
            <a href="/" class="yeevu-nav-logo">Yeevu AI</a>
            <div class="yeevu-nav-links">
                ${!isHome ? '<a href="/">Home</a>' : ''}
                <a href="/deliverability/">Email Deliverability</a>
                <a href="/dns-email-resolver/">DNS Resolver</a>
                <a href="https://ai.yeevu.com" target="_blank" rel="noopener noreferrer">Create Apps & Websites</a>
                <a href="/content-creator/">Content Creator</a>

                <a href="/account/">Account</a>
            </div>
            <div class="yeevu-nav-auth" id="yeevu-nav-auth">
                ${user
                    ? `<span class="yeevu-nav-user">${safeEmail}</span>
                       <button id="yeevu-logout-btn" class="yeevu-nav-btn yeevu-nav-btn-outline">Logout</button>`
                    : `<button id="yeevu-login-btn" class="yeevu-nav-btn">Sign In</button>
                       <button id="yeevu-signup-btn" class="yeevu-nav-btn yeevu-nav-btn-outline">Sign Up</button>`
                }
            </div>
        </div>
    `;

    document.body.insertBefore(nav, document.body.firstChild);

    // Attach event listeners
    if (user) {
        document.getElementById('yeevu-logout-btn')?.addEventListener('click', logout);
    } else {
        document.getElementById('yeevu-login-btn')?.addEventListener('click', login);
        document.getElementById('yeevu-signup-btn')?.addEventListener('click', signup);
    }
}

// --- Inject Global Styles ---
export function injectGlobalStyles() {
    if (document.getElementById('yeevu-global-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'yeevu-global-styles';
    styles.textContent = `
        /* Yeevu Navigation */
        .yeevu-nav {
            background: linear-gradient(135deg, #0b0b0b 0%, #151515 100%);
            padding: 0.75rem 1.5rem;
            position: sticky;
            top: 0;
            z-index: 1000;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        }
        .yeevu-nav-inner {
            max-width: 1200px;
            margin: 0 auto;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 1rem;
        }
        .yeevu-nav-logo {
            font-family: 'EB Garamond', serif;
            font-size: 1.5rem;
            font-weight: 700;
            color: #f5c400;
            text-decoration: none;
        }
        .yeevu-nav-links {
            display: flex;
            gap: 1.5rem;
        }
        .yeevu-nav-links a {
            color: #f2f2f2;
            text-decoration: none;
            font-size: 0.9rem;
            transition: color 0.3s;
        }
        .yeevu-nav-links a:hover {
            color: #f5c400;
        }
        .yeevu-nav-auth {
            display: flex;
            align-items: center;
            gap: 0.75rem;
        }
        .yeevu-nav-user {
            color: #f5c400;
            font-size: 0.9rem;
        }
        .yeevu-nav-btn {
            padding: 0.5rem 1rem;
            border-radius: 6px;
            font-size: 0.85rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s;
            border: none;
            background: #f5c400;
            color: #0b0b0b;
        }
        .yeevu-nav-btn:hover {
            background: #e0b200;
        }
        .yeevu-nav-btn-outline {
            background: transparent;
            border: 1px solid #f5c400;
            color: #f5c400;
        }
        .yeevu-nav-btn-outline:hover {
            background: #f5c400;
            color: #0b0b0b;
        }

        /* Loading Overlay */
        #yeevu-loader {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(11, 11, 11, 0.9);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 9999;
        }
        .yeevu-loader-content {
            text-align: center;
            color: #fff;
        }
        .yeevu-spinner {
            width: 50px;
            height: 50px;
            border: 4px solid #333;
            border-top: 4px solid #f5c400;
            border-radius: 50%;
            animation: yeevu-spin 1s linear infinite;
            margin: 0 auto 1rem;
        }
        @keyframes yeevu-spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        /* Responsive */
        @media (max-width: 768px) {
            .yeevu-nav-inner {
                flex-direction: column;
            }
            .yeevu-nav-links {
                flex-wrap: wrap;
                justify-content: center;
            }
            .yeevu-nav-auth {
                flex-direction: column;
                align-items: center;
            }
        }
    `;
    document.head.appendChild(styles);
}

// --- App Initialization Helper ---
export async function initApp(options = {}) {
    const { showLoadingOnInit = true, onUserLoaded = null } = options;

    injectGlobalStyles();

    if (showLoadingOnInit) {
        showLoading('Checking authentication...');
    }

    handleTokenFromHash();

    let user = null;
    try {
        user = await checkSubscription();
    } catch (e) {
        logToStorage('initApp', 'Error during subscription check', { error: e.message });
    }

    hideLoading();
    initHeader(user);

    if (onUserLoaded && typeof onUserLoaded === 'function') {
        onUserLoaded(user);
    }

    return user;
}

// --- Handle Auth Token (now primarily reads from localStorage) ---
export function handleTokenFromHash() {
    const hash = window.location.hash;
    logToStorage('handleTokenFromHash', 'Checking for token', { hashPresent: !!hash, hashContainsToken: hash.includes('access_token') });
    if (hash.includes('access_token')) {
        const params = new URLSearchParams(hash.replace('#', ''));
        const token = params.get('access_token');
        if (token) {
            localStorage.setItem('token', token);
            window.location.hash = ''; // Clear hash to prevent re-processing
            logToStorage('handleTokenFromHash', 'Token extracted from hash and stored', { tokenLength: token.length });
            return token;
        }
    }
    const storedToken = localStorage.getItem('token');
    logToStorage('handleTokenFromHash', 'Using stored token', { tokenExists: !!storedToken });
    return storedToken;
}

// --- Check Subscription Status via N8N ---
export async function checkSubscription() {
    const token = localStorage.getItem('token');
    logToStorage('checkSubscription', 'Starting subscription check', { tokenExists: !!token });
    if (!token) return null; // No token, no check

    try {
        const response = await fetch('https://engine.yeevu.com/webhook/api/user/subscription', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}` // N8N uses this to authenticate and get user info
            }
        });
        logToStorage('checkSubscription', 'API response received', { status: response.status });

        if (response.status === 401) {
            // Token is invalid/expired on the server-side, clear it
            localStorage.removeItem('token');
            logToStorage('checkSubscription', 'AUTH FAILED - 401 Unauthorized, token removed', { status: 401 });
            return null;
        }

        if (!response.ok) {
            const errorText = await response.text();
            logToStorage('checkSubscription', 'API ERROR - Non-OK response', { status: response.status, error: errorText });
            throw new Error(`Subscription API fetch failed: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        logToStorage('checkSubscription', 'SUCCESS - User data received', { email: data.email, subscriptions: data.subscriptionList });

        // Ensure subscriptionList is an array, even if the API returns null or undefined
        if (!Array.isArray(data.subscriptionList)) {
            data.subscriptionList = [];
            logToStorage('checkSubscription', 'WARNING - subscriptionList was not an array, initialized empty');
        }

        return data; // Return the user object
    } catch (error) {
        logToStorage('checkSubscription', 'EXCEPTION - Subscription check failed', { error: error.message });
        localStorage.removeItem('token'); // Clear token on network/API errors as well
        return null;
    }
}

// --- Wait for buttons to appear before attaching events (for dynamically loaded elements) ---
export function waitForElement(id, callback, timeout = 5000) {
    let el = document.getElementById(id);
    if (el) {
        console.log(`✅ Common JS waitForElement: Found '${id}' immediately.`);
        return callback(el);
    }

    console.log(`⏳ Common JS waitForElement: Starting observer for '${id}'...`);
    let observer = null;
    let timeoutId = null;

    const checkElement = () => {
        el = document.getElementById(id);
        if (el) {
            if (observer) observer.disconnect();
            if (timeoutId) clearTimeout(timeoutId);
            console.log(`✅ Common JS waitForElement: Found '${id}' via check/observer.`);
            callback(el);
            return true;
        }
        return false;
    };

    if (checkElement()) return;

    observer = new MutationObserver((mutationsList, obs) => {
        if (checkElement()) {
            obs.disconnect();
        }
    });

    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'display', 'class'] });

    timeoutId = setTimeout(() => {
        if (observer) observer.disconnect();
        el = document.getElementById(id);
        if (el) {
            console.warn(`⚠️ Common JS waitForElement: Found '${id}' late via timeout fallback.`);
            callback(el);
        } else {
            console.error(`❌ Common JS waitForElement: Element '${id}' not found after ${timeout / 1000} seconds.`);
        }
    }, timeout);
}
