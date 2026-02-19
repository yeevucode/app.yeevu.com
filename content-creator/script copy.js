// ai-content-creator/script.js

import { 
    displayMessage, 
    login, 
    signup, 
    subscribe, 
    handleTokenFromHash, 
    checkSubscription 
} from '../js/common.js'; // Adjusted path to common.js

document.addEventListener('DOMContentLoaded', () => {
    let user = null;

    const loginPrompt = document.getElementById('loginPrompt');
    const paywallOverlay = document.getElementById('paywallOverlay');
    const mainContent = document.getElementById('mainContent');
    const tabButtons = document.querySelectorAll('.resolver-selector .mode-btn'); // Re-using resolver-selector class name
    const forms = document.querySelectorAll('.resolver-form'); // Re-using resolver-form class name
    const webhookResponseTextarea = document.getElementById('webhook-response');
    const welcomeMessageElement = document.getElementById('welcomeMessage');

    // Define the specific subscription code required for each Content Creator mode
    const CC_MODE_SUBSCRIPTION_REQUIREMENTS = {
        'blog-post': ['cc-basic', 'cc-premium', 'cc-lifetime'], // Example: Basic or higher
        'social-media': ['cc-basic', 'cc-premium', 'cc-lifetime'],
        'long-form': ['cc-premium', 'cc-lifetime'] // Example: Premium or higher
    };

    function isRestricted(mode) {
        if (!user || !Array.isArray(user.subscriptionList) || user.subscriptionList.length === 0) {
            console.log(`Restriction: ${mode} requires login or an active subscription.`);
            return true;
        }

        const userSubscriptions = user.subscriptionList;
        const requiredCodesForMode = CC_MODE_SUBSCRIPTION_REQUIREMENTS[mode];

        if (!requiredCodesForMode) {
            console.warn(`Unknown mode '${mode}' encountered. Defaulting to restricted.`);
            return true;
        }

        const hasAccess = requiredCodesForMode.some(requiredCode => userSubscriptions.includes(requiredCode));

        if (!hasAccess) {
            console.log(`Restriction: ${mode} requires one of [${requiredCodesForMode.join(', ')}]. User subscriptions: [${userSubscriptions.join(', ')}]`);
            return true;
        }

        return false;
    }

    function updateUIAccess() {
        loginPrompt.style.display = 'none';
        paywallOverlay.style.display = 'none';
        mainContent.style.display = 'none';
        displayMessage('');
        if (welcomeMessageElement) {
            welcomeMessageElement.style.display = 'none';
            welcomeMessageElement.textContent = '';
        }

        if (!user) {
            loginPrompt.style.display = 'block';
            console.log('UI State: Showing Login Prompt.');
        } else {
            // Check if even the base tier ('blog-post') is restricted
            if (isRestricted('blog-post')) {
                paywallOverlay.style.display = 'flex';
                displayMessage('You are logged in, but your current subscription does not include access to the AI Content Creator. Please upgrade your plan.', 'info');
                console.log('UI State: User logged in, but subscription is insufficient for any tier. Showing Paywall.');
            } else {
                mainContent.style.display = 'block';
                console.log('UI State: User logged in and subscribed. Showing Main Content.');

                if (welcomeMessageElement) {
                    const userEmail = user.email || 'there';
                    welcomeMessageElement.textContent = `Welcome, ${userEmail}!`;
                    welcomeMessageElement.style.display = 'block';
                }

                // Default to 'blog-post' tab
                showTab('blog-post');
            }
        }
    }

    function showTab(tabId) {
        forms.forEach(form => {
            form.style.display = 'none';
        });
        tabButtons.forEach(btn => {
            btn.classList.remove('active');
            btn.setAttribute('aria-selected', 'false');
        });

        const activeForm = document.getElementById(`form-${tabId}`);
        if (activeForm) {
            activeForm.style.display = 'block';
            document.getElementById(`tab-${tabId}`).classList.add('active');
            document.getElementById(`tab-${tabId}`).setAttribute('aria-selected', 'true');
        } else {
            console.error(`Form with ID 'form-${tabId}' not found.`);
        }
        displayMessage('');
        webhookResponseTextarea.value = '';
        webhookResponseTextarea.style.display = 'none';
    }

    tabButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            const mode = e.target.dataset.mode;
            console.log(`Tab clicked: ${mode}`);

            if (isRestricted(mode)) {
                paywallOverlay.style.display = 'flex';
                displayMessage(`To access the ${mode.replace('-', ' ').charAt(0).toUpperCase() + mode.replace('-', ' ').slice(1)} tool, please upgrade your subscription.`, 'info');

                const currentActiveTab = document.querySelector('.mode-btn.active');
                if (currentActiveTab) {
                    showTab(currentActiveTab.dataset.mode);
                } else {
                    if (!isRestricted('blog-post')) {
                        showTab('blog-post');
                    } else {
                        mainContent.style.display = 'none';
                    }
                }
                return;
            }

            paywallOverlay.style.display = 'none';
            displayMessage('');
            showTab(mode);
        });
    });

    async function handleFormSubmit(event, formElement) {
        event.preventDefault();

        const mode = formElement.id.replace('form-', '');

        if (isRestricted(mode)) {
            displayMessage(`To submit the ${mode.replace('-', ' ').charAt(0).toUpperCase() + mode.replace('-', ' ').slice(1)} request, please upgrade your subscription.`, 'error');
            paywallOverlay.style.display = 'flex';
            return;
        }

        const formData = new FormData(formElement);
        const data = {};
        formData.forEach((value, key) => {
            data[key] = value;
        });

        data['content_tool'] = mode; // Identify the tool used

        try {
            const token = localStorage.getItem('token');
            if (!token) {
                displayMessage('You must be logged in to submit this form. Please sign in.', 'error');
                loginPrompt.style.display = 'block';
                mainContent.style.display = 'none';
                return;
            }

            displayMessage('Generating content...', 'info');
            webhookResponseTextarea.value = '';
            webhookResponseTextarea.style.display = 'none';

            const response = await fetch(formElement.action, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(data),
            });

            if (response.status === 403) {
                displayMessage('Unauthorized: Your current subscription does not allow this content generation. Please upgrade.', 'error');
                paywallOverlay.style.display = 'flex';
                return;
            }
            if (response.status === 401) {
                displayMessage('Authentication failed. Your session may have expired. Please log in again.', 'error');
                localStorage.removeItem('token');
                user = null;
                updateUIAccess();
                return;
            }

            if (response.ok) {
                const result = await response.json();
                webhookResponseTextarea.value = JSON.stringify(result, null, 2);
                webhookResponseTextarea.style.display = 'block';

                if (result.status === 'success') {
                    displayMessage(result.message || 'Content generated successfully!', 'success');
                    formElement.reset();
                } else {
                    displayMessage(result.message || 'An error occurred during content generation.', 'error');
                }
            } else {
                let errorText = await response.text();
                try {
                    const errorJson = JSON.parse(errorText);
                    errorText = errorJson.message || errorText;
                } catch (e) { /* not JSON */ }
                displayMessage(`Generation failed: ${response.status} ${response.statusText}. ${errorText}`, 'error');
            }
        } catch (error) {
            displayMessage('Network Error: Could not connect to the server. Please try again.', 'error');
            webhookResponseTextarea.value = 'Error: ' + error.message;
            webhookResponseTextarea.style.display = 'block';
        }
    }

    document.getElementById('form-blog-post')?.addEventListener('submit', (e) => handleFormSubmit(e, e.target));
    document.getElementById('form-social-media')?.addEventListener('submit', (e) => handleFormSubmit(e, e.target));
    document.getElementById('form-long-form')?.addEventListener('submit', (e) => handleFormSubmit(e, e.target));

    const loginBtn = document.getElementById('loginBtn');
    const signupBtn = document.getElementById('signupBtn');
    const subscribeBtn = document.getElementById('subscribeBtn');

    if (loginBtn) { loginBtn.addEventListener('click', login); }
    if (signupBtn) { signupBtn.addEventListener('click', signup); }
    if (subscribeBtn) { subscribeBtn.addEventListener('click', subscribe); }

    if (paywallOverlay) {
        paywallOverlay.addEventListener('click', (e) => {
            if (e.target === paywallOverlay) {
                paywallOverlay.style.display = 'none';
                displayMessage('');
            }
        });
    }

    console.log('--- Initializing AI Content Creator App ---');
    handleTokenFromHash();

    checkSubscription()
        .then(userData => {
            user = userData;
            updateUIAccess();
        })
        .catch(err => {
            console.error('App initialization error (subscription check failed):', err);
            updateUIAccess();
        });
});