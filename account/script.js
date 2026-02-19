import { initApp, login, signup } from '../js/common.js';

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function setList(id, items, emptyLabel = 'None') {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = '';
    if (!items || items.length === 0) {
        const li = document.createElement('li');
        li.classList.add('is-empty');
        li.textContent = emptyLabel;
        el.appendChild(li);
        return;
    }
    items.forEach(item => {
        const li = document.createElement('li');
        li.textContent = item;
        el.appendChild(li);
    });
}

function setAuthPill(text, variant) {
    const pill = document.getElementById('auth-pill');
    if (!pill) return;
    pill.textContent = text;
    pill.classList.remove('status-pill--active', 'status-pill--inactive', 'status-pill--pending');
    if (variant) {
        pill.classList.add(`status-pill--${variant}`);
    }
}

async function copyToClipboard(text, button) {
    if (!text) return;
    const original = button?.textContent || '';
    let success = false;

    try {
        await navigator.clipboard.writeText(text);
        success = true;
    } catch (err) {
        try {
            const tempInput = document.createElement('input');
            tempInput.value = text;
            document.body.appendChild(tempInput);
            tempInput.select();
            success = document.execCommand('copy');
            document.body.removeChild(tempInput);
        } catch (fallbackErr) {
            success = false;
        }
    }

    if (button) {
        button.textContent = success ? 'Copied' : 'Copy failed';
        button.disabled = true;
        setTimeout(() => {
            button.textContent = original;
            button.disabled = false;
        }, 1500);
    }
}

function setVisibility(el, isVisible) {
    if (!el) return;
    el.style.display = isVisible ? 'inline-flex' : 'none';
}

document.addEventListener('DOMContentLoaded', () => {
    const copyUserIdBtn = document.getElementById('copy-user-id-btn');
    const copyEmailBtn = document.getElementById('copy-email-btn');
    const pageLoginBtn = document.getElementById('page-login-btn');
    const accountCard = document.getElementById('accountCard');
    const accountLoginPrompt = document.getElementById('accountLoginPrompt');
    const accountLoginBtn = document.getElementById('accountLoginBtn');
    const accountSignupBtn = document.getElementById('accountSignupBtn');

    pageLoginBtn?.addEventListener('click', login);
    accountLoginBtn?.addEventListener('click', login);
    accountSignupBtn?.addEventListener('click', signup);

    initApp({
        showLoadingOnInit: true,
        onUserLoaded: (user) => {
            const token = localStorage.getItem('token');
            if (!user) {
                setText('auth-status', 'Not signed in');
                setText('auth-help', 'Sign in to view your account details and subscription access.');
                setAuthPill('Signed Out', 'inactive');
                setText('user-email', '-');
                setText('user-id', '-');
                setList('user-subscriptions', [], '-');
                setText('token-status', token ? `Token present (${token.length} chars).` : 'No token found in localStorage.');
                setVisibility(copyUserIdBtn, false);
                setVisibility(copyEmailBtn, false);
                setVisibility(pageLoginBtn, true);
                if (accountLoginPrompt) accountLoginPrompt.style.display = 'block';
                if (accountCard) accountCard.style.display = 'none';
                return;
            }

            const userId = user.sub || user.user_id || user.userId || 'Unavailable';
            const subscriptions = Array.isArray(user.subscriptionList)
                ? user.subscriptionList
                : [];

            setText('auth-status', 'Signed in');
            setText('auth-help', 'Share your User ID with support to enable additional products.');
            setAuthPill('Active', 'active');
            setText('user-email', user.email || 'Unknown');
            setText('user-id', userId);
            setList('user-subscriptions', subscriptions);
            setText('token-status', token ? `Token present (${token.length} chars).` : 'Token missing.');

            setVisibility(copyUserIdBtn, true);
            setVisibility(copyEmailBtn, true);
            setVisibility(pageLoginBtn, false);
            if (accountLoginPrompt) accountLoginPrompt.style.display = 'none';
            if (accountCard) accountCard.style.display = 'block';

            copyUserIdBtn?.addEventListener('click', () => copyToClipboard(userId, copyUserIdBtn));
            copyEmailBtn?.addEventListener('click', () => copyToClipboard(user.email || '', copyEmailBtn));
        }
    });
});
