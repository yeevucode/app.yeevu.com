// ai-content-creator/script.js

import {
    displayMessage,
    login,
    signup,
    subscribe,
    initApp
} from '../js/common.js';

document.addEventListener('DOMContentLoaded', () => {
    let user = null;

    const loginPrompt = document.getElementById('loginPrompt');
    const paywallOverlay = document.getElementById('paywallOverlay');
    const mainContent = document.getElementById('mainContent');
    const tabButtons = document.querySelectorAll('.resolver-selector .mode-btn'); 
    const forms = document.querySelectorAll('.resolver-form'); // Selects all three separate forms
    const webhookResponseTextarea = document.getElementById('webhook-response'); // This is now mostly for fallback/debugging
    const welcomeMessageElement = document.getElementById('welcomeMessage');

    // Re-introduce references to modal elements as they are now present in HTML
    const responseModal = document.getElementById('responseModal');
    const modalResponseContent = document.getElementById('modalResponseContent');
    const closeModalBtn = document.getElementById('closeModalBtn');

    // The socialMediaResponseContainer is present in HTML but will not be used for display
    const socialMediaResponseContainer = document.getElementById('socialMediaResponseContainer');


    // Define the specific subscription code required for each Content Creator mode
    const CC_MODE_SUBSCRIPTION_REQUIREMENTS = {
        'blog-post': ['cc-basic', 'cc-premium', 'cc-lifetime'], 
        'social-media': ['cc-basic', 'cc-premium', 'cc-lifetime'], 
        'long-form': ['cc-premium', 'cc-lifetime'] 
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
            if (isRestricted('blog-post')) { // Check if even the base tier ('blog-post') is restricted
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

                // Default to 'blog-post' tab and update the form
                showTab('blog-post');
            }
        }
    }

    function showTab(tabId) {
        // Hide all forms
        forms.forEach(form => {
            form.style.display = 'none';
        });

        // Ensure webhook response textarea is hidden when switching tabs
        webhookResponseTextarea.value = '';
        webhookResponseTextarea.style.display = 'none';

        // Ensure socialMediaResponseContainer is hidden when switching tabs (it's not used for display now)
        if (socialMediaResponseContainer) {
            socialMediaResponseContainer.style.display = 'none';
            socialMediaResponseContainer.innerHTML = '<h3>Generated Social Media Content</h3>'; // Clear previous content
        }

        // Deactivate all tab buttons
        tabButtons.forEach(btn => {
            btn.classList.remove('active');
            btn.setAttribute('aria-selected', 'false');
        });

        // Show the active form and activate its button
        const activeForm = document.getElementById(`form-${tabId}`);
        if (activeForm) {
            activeForm.style.display = 'block';
            const activeTabButton = document.getElementById(`tab-${tabId}`);
            if (activeTabButton) {
                activeTabButton.classList.add('active');
                activeTabButton.setAttribute('aria-selected', 'true');
            }
        } else {
            console.error(`Form with ID 'form-${tabId}' not found.`);
        }

        displayMessage(''); // Clear any previous messages
        // Close the modal if it's open when switching tabs
        if (responseModal) {
            responseModal.classList.remove('show');
            if (modalResponseContent) {
                modalResponseContent.innerHTML = ''; // Clear content
            }
        }
    }

    tabButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            const mode = e.target.dataset.mode;
            console.log(`Tab clicked: ${mode}`);

            if (isRestricted(mode)) {
                paywallOverlay.style.display = 'flex';
                displayMessage(`To access the ${mode.replace('-', ' ').charAt(0).toUpperCase() + mode.replace('-', ' ').slice(1)} tool, please upgrade your subscription.`, 'info');
                
                // Revert to the previously active tab/form if possible
                const currentActiveTab = document.querySelector('.mode-btn.active');
                if (currentActiveTab) {
                    showTab(currentActiveTab.dataset.mode); // Re-show current active tab
                } else {
                    // Fallback: If no tab was active (e.g., first click on restricted tab),
                    // ensure 'blog-post' is shown if user has access to it.
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

    /**
     * Clears the content-specific fields of a given form.
     * Business information fields are intentionally not cleared.
     * @param {string} formId The ID of the form to clear (e.g., 'form-blog-post').
     */
    function clearContentSpecificFields(formId) {
        const form = document.getElementById(formId);
        if (!form) {
            console.error(`Form with ID ${formId} not found for clearing.`);
            return;
        }

        switch (formId) {
            case 'form-blog-post':
                form.querySelector('#blog_post_title').value = '';
                form.querySelector('#blog_keywords').value = '';
                form.querySelector('#blog_cta_link').value = '';
                form.querySelector('#blog_tone').value = 'informative'; // Reset to default tone
                form.querySelector('#blog_content_brief').value = '';
                break;
            case 'form-social-media':
                form.querySelector('#social_post_title').value = '';
                form.querySelector('#social_keywords').value = '';
                form.querySelector('#social_cta_link').value = '';
                form.querySelector('#social_content_brief').value = '';
                form.querySelector('#hashtags').value = '';
                break;
            case 'form-long-form':
                form.querySelector('#long_post_title').value = '';
                form.querySelector('#long_keywords').value = '';
                form.querySelector('#long_cta_link').value = '';
                form.querySelector('#long_tone').value = 'informative'; // Reset to default tone
                form.querySelector('#long_content_brief').value = '';
                form.querySelector('#long_form_length').value = '1000'; // Reset to default length
                break;
            default:
                console.warn(`No specific clearing logic for form ID: ${formId}`);
                // Fallback to full form reset if no specific logic is found
                form.reset(); 
        }
    }

    /**
     * Copies text content to the clipboard.
     * @param {string} text The text to copy.
     */
    function copyToClipboard(text) {
        // Use document.execCommand('copy') as navigator.clipboard.writeText()
        // may not work due to iFrame restrictions in some environments.
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed'; // Avoid scrolling to bottom
        textarea.style.left = '-9999px'; // Hide from view
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            displayMessage('Content copied to clipboard!', 'success');
        } catch (err) {
            console.error('Failed to copy text: ', err);
            displayMessage('Failed to copy content. Please copy manually.', 'error');
        } finally {
            document.body.removeChild(textarea);
        }
    }

    // Removed the cleanAnnotation function as per user feedback that data values are clean.


    // Handle form submission for each separate form
    forms.forEach(formElement => {
        formElement.addEventListener('submit', async (e) => {
            e.preventDefault();
            const mode = formElement.id.replace('form-', ''); // Get mode from form ID
            console.log(`Form submitted for content type: ${mode}`);

            if (isRestricted(mode)) {
                displayMessage(`To submit the ${mode.replace('-', ' ').charAt(0).toUpperCase() + mode.replace('-', ' ').slice(1)} request, please upgrade your subscription.`, 'error');
                paywallOverlay.style.display = 'flex';
                return;
            }

            const formData = new FormData(formElement);
            const data = {};

            // Collect all form data.
            for (let [key, value] of formData.entries()) {
                data[key] = value;
            }
            
            // Remove 'tone' if the mode is 'social-media'
            if (mode === 'social-media' && data.hasOwnProperty('tone')) {
                delete data.tone;
            }

            // Add content_type explicitly for the backend
            data['content_type'] = mode; 

            try {
                displayMessage('Generating content...', 'info');
                // Hide the webhook response textarea as we're using the modal now
                webhookResponseTextarea.value = '';
                webhookResponseTextarea.style.display = 'none';

                // Ensure socialMediaResponseContainer is hidden as it's not used for display
                if (socialMediaResponseContainer) {
                    socialMediaResponseContainer.style.display = 'none';
                    socialMediaResponseContainer.innerHTML = '<h3>Generated Social Media Content</h3>';
                }

                const token = localStorage.getItem('token');
                if (!token) {
                    displayMessage('You must be logged in to submit this form. Please sign in.', 'error');
                    loginPrompt.style.display = 'block';
                    mainContent.style.display = 'none';
                    return;
                }

                const response = await fetch(formElement.action, { // Use the form's action
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
                    
                    // Display response in the dedicated container for social-media form, otherwise use textarea
                    if (mode === 'social-media') {
                        let formattedHtmlOutput = ''; // Use HTML for better presentation
                        if (result && result.data && result.data.length > 0 && result.data[0].output) {
                            const output = result.data[0].output;
                            
                            // Event Name and Description (if available)
                            if (output.event_name) {
                                formattedHtmlOutput += `<h3>Event: ${output.event_name}</h3>`;
                            }
                            if (output.event_description) {
                                formattedHtmlOutput += `<p>${output.event_description}</p>`; 
                            }

                            if (output.platform_posts) {
                                const platformPosts = output.platform_posts;
                                for (const platform in platformPosts) {
                                    if (platformPosts.hasOwnProperty(platform)) {
                                        const postData = platformPosts[platform];
                                        let platformContent = ''; // Accumulate content for this platform
                                        let copyAllText = ''; // Accumulate text for "Copy All" button

                                        platformContent += `<div class="platform-post-card">`; // Use a class for styling
                                        platformContent += `<h4>${platform}</h4>`;

                                        // Directly use postData values as they are assumed to be clean
                                        if (postData.post) {
                                            platformContent += `<p><span id="post-${platform}">${postData.post}</span> <button class="copy-btn" data-target="post-${platform}">Copy</button></p>`; 
                                            copyAllText += `${postData.post}\n`;
                                        }
                                        
                                        if (postData.caption) {
                                            platformContent += `<p><span id="caption-${platform}">${postData.caption}</span> <button class="copy-btn" data-target="caption-${platform}">Copy</button></p>`; 
                                            copyAllText += `${postData.caption}\n`;
                                        }

                                        if (postData.emojis && postData.emojis.length > 0) {
                                            const emojisText = postData.emojis.join(' ');
                                            platformContent += `<p><span id="emojis-${platform}">${emojisText}</span> <button class="copy-btn" data-target="emojis-${platform}">Copy</button></p>`; 
                                            copyAllText += `${emojisText}\n`;
                                        }

                                        if (postData.hashtags && postData.hashtags.length > 0) {
                                            const hashtagsText = postData.hashtags.join(' ');
                                            platformContent += `<p><span id="hashtags-${platform}">${hashtagsText}</span> <button class="copy-btn" data-target="hashtags-${platform}">Copy</button></p>`; 
                                            copyAllText += `${hashtagsText}\n`;
                                        }

                                        if (postData.call_to_action) {
                                            platformContent += `<p><span id="cta-${platform}">${postData.call_to_action}</span> <button class="copy-btn" data-target="cta-${platform}">Copy</button></p>`; 
                                            copyAllText += `${postData.call_to_action}\n`;
                                        }
                                        
                                        if (postData.character_limit) {
                                            platformContent += `<p><small>(Character Limit: ${postData.character_limit})</small></p>`;
                                        }
                                        
                                        // Add a "Copy All" button for the entire platform post
                                        platformContent += `<button class="copy-all-btn" data-copy-content="${encodeURIComponent(copyAllText.trim())}">Copy All for ${platform}</button>`;
                                        
                                        platformContent += `</div>`;
                                        formattedHtmlOutput += platformContent;
                                    }
                                }
                            }
                        } else {
                            formattedHtmlOutput = "<p>No social media content found in the response or unexpected response structure.</p>";
                            console.warn("Webhook response structure for social media was unexpected:", result);
                            // Fallback to raw JSON if parsing fails or structure is unexpected
                            formattedHtmlOutput = `<pre>${JSON.stringify(result, null, 2)}</pre>`;
                        }

                        if (modalResponseContent && responseModal) {
                            modalResponseContent.innerHTML = formattedHtmlOutput; // Use innerHTML for formatted content
                            responseModal.classList.add('show');

                            // Attach event listeners to the newly created copy buttons
                            document.querySelectorAll('.copy-btn').forEach(button => {
                                button.onclick = function() {
                                    const targetId = this.dataset.target;
                                    // Get text directly from the span element, which should contain clean data
                                    const textToCopy = document.getElementById(targetId)?.textContent || '';
                                    copyToClipboard(textToCopy);
                                };
                            });

                            document.querySelectorAll('.copy-all-btn').forEach(button => {
                                button.onclick = function() {
                                    const textToCopy = decodeURIComponent(this.dataset.copyContent || '');
                                    copyToClipboard(textToCopy);
                                };
                            });

                        } else {
                            // Fallback if modal elements are somehow not found
                            webhookResponseTextarea.value = JSON.stringify(result, null, 2);
                            webhookResponseTextarea.style.display = 'block';
                        }
                        displayMessage('Social Media Post Generated!', 'success');
                    } else {
                        // For non-social media modes, display raw JSON in the modal
                        if (modalResponseContent && responseModal) {
                            modalResponseContent.textContent = JSON.stringify(result, null, 2); // Use textContent for raw JSON
                            responseModal.classList.add('show');
                        } else {
                            // Fallback if modal elements are somehow not found
                            webhookResponseTextarea.value = JSON.stringify(result, null, 2);
                            webhookResponseTextarea.style.display = 'block';
                        }
                        displayMessage(result.message || 'Content generated successfully!', 'success');
                    }
                    // Call the new function to clear only content-specific fields
                    clearContentSpecificFields(formElement.id); 
                } else {
                    let errorText = await response.text();
                    try {
                        const errorJson = JSON.parse(errorText);
                        errorText = errorJson.message || errorText;
                    } catch (e) { /* not JSON */ }
                    displayMessage(`Generation failed: ${response.status} ${response.statusText}. ${errorText}`, 'error');
                    // Fallback to textarea for errors if modal isn't available
                    webhookResponseTextarea.value = `Error: ${errorText}`;
                    webhookResponseTextarea.style.display = 'block';
                }
            } catch (error) {
                displayMessage('Network Error: Could not connect to the server. Please try again.', 'error');
                webhookResponseTextarea.value = 'Error: ' + error.message;
                webhookResponseTextarea.style.display = 'block';
            }
        });
    });

    // Event listener for closing the modal
    closeModalBtn?.addEventListener('click', () => {
        responseModal.classList.remove('show');
        modalResponseContent.innerHTML = ''; // Clear content
    });

    // Close modal if clicking outside the content
    responseModal?.addEventListener('click', (e) => {
        if (e.target === responseModal) {
            responseModal.classList.remove('show');
            modalResponseContent.innerHTML = ''; // Clear content
        }
    });


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

    // --- App Initialization ---
    initApp({
        showLoadingOnInit: true,
        onUserLoaded: (userData) => {
            user = userData;
            updateUIAccess();
        }
    });
});
