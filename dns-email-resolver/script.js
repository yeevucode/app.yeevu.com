// dns-email-resolver/script.js

// Import common utilities from the centralized common.js file
import {
    displayMessage,
    login,
    signup,
    subscribe,
    initApp,
    waitForElement
} from '../js/common.js';

document.addEventListener('DOMContentLoaded', () => {
    let user = null;
    const loginPromptElement = document.getElementById('loginPrompt');
    if (loginPromptElement) {
        console.log('Login Prompt element found in DOM initially.');
        console.log('   Computed display:', window.getComputedStyle(loginPromptElement).display);
        console.log('   Computed visibility:', window.getComputedStyle(loginPromptElement).visibility);
        console.log('   Offset height (0 if display:none):', loginPromptElement.offsetHeight);
    } else {
        console.warn('Login Prompt element NOT found in DOM initially!');
    }

    const loginBtnElementInitial = document.getElementById('loginBtn');
    const signupBtnElementInitial = document.getElementById('signupBtn');
    console.log('loginBtn found in DOM initially:', !!loginBtnElementInitial);
    if (loginBtnElementInitial) {
        console.log('   loginBtn computed display:', window.getComputedStyle(loginBtnElementInitial).display);
        console.log('   loginBtn computed visibility:', window.getComputedStyle(loginBtnElementInitial).visibility);
        console.log('   loginBtn offset height (0 if display:none):', loginBtnElementInitial.offsetHeight);
    }
    console.log('signupBtn found in DOM initially:', !!signupBtnElementInitial);
    if (signupBtnElementInitial) {
        console.log('   signupBtn computed display:', window.getComputedStyle(signupBtnElementInitial).display);
        console.log('   signupBtn computed visibility:', window.getComputedStyle(signupBtnElementInitial).visibility);
        console.log('   signupBtn offset height (0 if display:none):', signupBtnElementInitial.offsetHeight);
    }
    console.groupEnd();
    // --- End Initial DOM State Check ---


    // Attach listeners using waitForElement (imported from common.js)
    waitForElement('loginBtn', btn => {
        console.log('🚀 Attaching click listener to loginBtn');
        btn.addEventListener('click', login);
    });

    waitForElement('signupBtn', btn => {
        console.log('🚀 Attaching click listener to signupBtn');
        btn.addEventListener('click', signup);
    });

    waitForElement('subscribeBtn', btn => {
        console.log('🚀 Attaching click listener to subscribeBtn');
        btn.addEventListener('click', subscribe);
    });

    // --- Update UI function specific to DNS Resolver ---
    function updateUI() {
        console.log('Updating UI, user:', user); // Log the actual 'user' object here
        const forms = {
            website: document.getElementById('form-website'),
            email: document.getElementById('form-email'),
            both: document.getElementById('form-both'),
            ai: document.getElementById('form-ai'),
            other: document.getElementById('form-other')
        };
        const loginPrompt = document.querySelector('.login-prompt');
        const resolverSelector = document.querySelector('.resolver-selector');
        const paywallOverlay = document.getElementById('paywallOverlay'); // Ensure paywall is referenced
        const welcomeMessageElement = document.getElementById('welcomeMessage'); // New: Welcome message element


        if (!loginPrompt) {
            console.error('updateUI: .login-prompt not found!');
            return;
        }
        if (!resolverSelector) {
            console.error('updateUI: .resolver-selector not found!');
            return;
        }
        if (!paywallOverlay) {
            console.error('updateUI: #paywallOverlay not found!');
            return;
        }
        if (welcomeMessageElement) {
            welcomeMessageElement.style.display = 'none'; // Hide welcome message by default
            welcomeMessageElement.textContent = '';
        }

        if (!user) { // If user is null (not logged in or subscription failed)
            console.log('No user logged in. Showing login prompt, hiding resolver.');
            loginPrompt.style.display = 'block';
            loginPrompt.style.visibility = 'visible';
            resolverSelector.style.display = 'none'; // Correctly hide resolver
            paywallOverlay.style.display = 'none'; // Ensure paywall is hidden
            Object.values(forms).forEach(form => form && (form.style.display = 'none'));
        } else { // If user is logged in
            console.log('User logged in. Hiding login prompt, showing resolver.');
            loginPrompt.style.display = 'none';
            loginPrompt.style.visibility = 'hidden';
            paywallOverlay.style.display = 'none'; // Ensure paywall is hidden

            // Check if 'website' mode is accessible (it should always be)
            if (isRestricted('website')) { // This should ideally never be true
                console.warn('Website mode unexpectedly restricted. Showing paywall.');
                paywallOverlay.style.display = 'flex';
                displayMessage('An unexpected error occurred with subscription access. Please contact support.', 'error');
                resolverSelector.style.display = 'none';
                Object.values(forms).forEach(form => form && (form.style.display = 'none'));
            } else {
                resolverSelector.style.display = 'flex';

                // Display welcome message
                if (welcomeMessageElement) {
                    const userEmail = user.email || 'there'; // Assuming user object has an 'email' property
                    welcomeMessageElement.textContent = `Welcome, ${userEmail}!`;
                    welcomeMessageElement.style.display = 'block';
                }

                // Set initial form based on default (website)
                document.querySelectorAll('.resolver-form').forEach(form => form.style.display = 'none');
                document.getElementById('form-website').style.display = 'block';

                // Set active tab to 'Website Only' by default when logged in
                document.querySelectorAll('.mode-btn').forEach(btn => {
                    btn.classList.remove('active');
                    btn.setAttribute('aria-selected', 'false');
                });
                document.getElementById('tab-website')?.classList.add('active');
                document.getElementById('tab-website')?.setAttribute('aria-selected', 'true');
            }
        }
    }

    // Define the specific subscription code required for each DNS Resolver mode
    // Assuming 'dns-premium' includes 'dns-basic'
    const DNS_MODE_SUBSCRIPTION_REQUIREMENTS = {
        'website': [], // 'website' mode is always free, no specific subscription needed
        'email': ['dns-basic', 'dns-premium'], // 'email' requires dns-basic or higher
        'both': ['dns-basic', 'dns-premium'],  // 'both' requires dns-basic or higher
        'ai': ['dns-premium'],                 // 'ai' requires dns-premium
        'other': ['dns-basic', 'dns-premium']   // 'other' requires dns-basic or higher
    };

    function isRestricted(mode) {
        if (mode === 'website') {
            return false; // 'website' mode is always free
        }

        // If user is not logged in, or has no subscriptionList, or subscriptionList is empty, restrict access.
        if (!user || !Array.isArray(user.subscriptionList) || user.subscriptionList.length === 0) {
            console.log(`Restriction: ${mode} requires login or an active subscription.`);
            return true;
        }

        const userSubscriptions = user.subscriptionList;
        const requiredCodesForMode = DNS_MODE_SUBSCRIPTION_REQUIREMENTS[mode];

        if (!requiredCodesForMode) {
            console.warn(`Unknown mode '${mode}' encountered. Defaulting to restricted.`);
            return true;
        }

        // Check if the user has ANY of the required subscriptions for the given mode
        const hasAccess = requiredCodesForMode.some(requiredCode => userSubscriptions.includes(requiredCode));

        if (!hasAccess) {
            console.log(`Restriction: '${mode}' requires one of [${requiredCodesForMode.join(', ')}]. User subscriptions: [${userSubscriptions.join(', ')}]`);
            return true;
        }

        return false; // User has access
    }

    document.querySelectorAll('.mode-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const mode = e.target.dataset.mode;
            console.log('Tab clicked:', mode);

            const currentActiveTab = document.querySelector('.mode-btn.active');
            const currentActiveForm = document.querySelector('.resolver-form[style*="block"]');


            if (isRestricted(mode)) {
                document.getElementById('paywallOverlay').style.display = 'flex';
                displayMessage(`To access the ${mode.charAt(0).toUpperCase() + mode.slice(1)} plan, please upgrade your subscription.`, 'info');

                if (currentActiveTab) {
                    currentActiveTab.classList.add('active');
                    currentActiveTab.setAttribute('aria-selected', 'true');
                }
                if (currentActiveForm) {
                    currentActiveForm.style.display = 'block';
                }
                return;
            }

            document.querySelectorAll('.mode-btn').forEach(btn => {
                btn.classList.remove('active');
                btn.setAttribute('aria-selected', 'false');
            });
            e.target.classList.add('active');
            e.target.setAttribute('aria-selected', 'true');

            document.querySelectorAll('.resolver-form').forEach(form => form.style.display = 'none');
            const targetForm = document.getElementById(`form-${mode}`);
            if (targetForm) {
                targetForm.style.display = 'block';
            } else {
                console.error(`Form with ID 'form-${mode}' not found.`);
            }
        });
    });

    document.querySelectorAll('.resolver-form').forEach(form => {
        if (form.tagName !== 'FORM') return;
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const mode = form.id.split('-')[1];
            console.log(`Form submitted for mode: ${mode}`);

            if (isRestricted(mode)) {
                document.getElementById('paywallOverlay').style.display = 'flex';
                displayMessage(`To submit the ${mode.charAt(0).toUpperCase() + mode.slice(1)} plan, please upgrade your subscription.`, 'error');
                return;
            }

            try {
                const token = localStorage.getItem('token'); // Get token from localStorage
                if (!token && mode !== 'website') { // website mode is generally free and might not require login
                    console.warn('Attempted to submit restricted form without token. Displaying login prompt.');
                    document.getElementById('loginPrompt').style.display = 'block';
                    document.querySelectorAll('.resolver-form').forEach(f => f.style.display = 'none');
                    document.querySelector('.resolver-selector').style.display = 'none';
                    displayMessage('You must be logged in to submit this form (except for Website Only). Please sign in.', 'error');
                    return;
                }

                const formData = new FormData(form);
                const jsonData = {};
                formData.forEach((value, key) => { jsonData[key] = value; });

                const response = await fetch(form.action, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token || ''}`,
                        'Content-Type': 'application/json',
                        'X-Form-Type': mode // Continue sending mode as X-Form-Type
                    },
                    body: JSON.stringify(jsonData)
                });

                if (response.status === 403) {
                    displayMessage('Unauthorized: Please upgrade your subscription to use this feature.', 'error');
                    document.getElementById('paywallOverlay').style.display = 'flex';
                    return;
                }
                if (response.status === 401) { // Unauthorized - token invalid/expired
                    displayMessage('Authentication failed. Your session may have expired. Please log in again.', 'error'); // More explicit message
                    localStorage.removeItem('token'); // Clear invalid token
                    user = null; // Reset user state
                    updateUI(); // Re-render UI to show login prompt
                    return;
                }
                if (!response.ok) {
                    const errorText = await response.text();
                    try {
                        const errorJson = JSON.parse(errorText);
                        errorText = errorJson.message || errorText;
                    } catch (e) { /* not JSON, use raw text */ }
                    displayMessage(`Submission failed: ${response.status} ${response.statusText}. ${errorText}`, 'error');
                }
                displayMessage('Form submitted successfully!', 'success');
                form.reset();
            } catch (error) {
                console.error('Submission error:', error);
                displayMessage('An error occurred during submission. Check console for details.', 'error');
            }
        });
    });

    const otherSubmitBtn = document.getElementById('otherSubmit');
    const copyOtherOutputBtn = document.getElementById('copyOtherOutput');

    otherSubmitBtn?.addEventListener('click', () => {
        if (isRestricted('other')) {
            document.getElementById('paywallOverlay').style.display = 'flex';
            displayMessage('To use the Custom Tools, please upgrade your subscription.', 'info');
            return;
        }
        const domain = document.getElementById('otherDomain').value.trim();
        let inputTemplate = document.getElementById('otherInput').value;
        if (!domain) return displayMessage('Please enter a domain name.', 'error');
        if (!inputTemplate) return displayMessage('Please paste the DNS template.', 'error');
        const trackingSubDomain = `tracking.${domain}`;
        const imageSubDomain = `image.${domain}`;
        inputTemplate = inputTemplate
            .replace(/\[Tracking-sub-domain\]/gi, trackingSubDomain)
            .replace(/\[Image-sub-domain\]/gi, imageSubDomain);
        document.getElementById('otherOutput').value = inputTemplate;
    });

    copyOtherOutputBtn?.addEventListener('click', () => {
        const output = document.getElementById('otherOutput');
        if (!output.value) return displayMessage('Nothing to copy!', 'info');
        output.select();
        try {
            document.execCommand('copy');
            displayMessage('Ongage Text Result copied to clipboard!', 'success');
        } catch (err) {
            navigator.clipboard.writeText(output.value)
                .then(() => displayMessage('Ongage Text Result copied to clipboard!', 'success'))
                .catch(copyErr => {
                    console.error('Failed to copy text using clipboard API:', copyErr);
                    displayMessage('Failed to copy. Please copy manually.', 'error');
                });
        }
    });

    document.getElementById('paywallOverlay').addEventListener('click', (e) => {
        if (e.target === document.getElementById('paywallOverlay')) {
            document.getElementById('paywallOverlay').style.display = 'none';
            // Clear message when closing overlay, but only if it's the paywall message
            // If there's another message from a form submission, keep it.
            // For simplicity, clearing it here is fine unless more complex message management is needed.
            displayMessage(''); 
        }
    });

    // --- App Initialization ---
    initApp({
        showLoadingOnInit: true,
        onUserLoaded: (userData) => {
            user = userData;
            updateUI();
        }
    });
});