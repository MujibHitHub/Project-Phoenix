(function () {
    const AUTH_KEYS = {
        access: 'supabase_access_token',
        refresh: 'supabase_refresh_token',
        userId: 'supabase_user_id',
        email: 'user_email'
    };

    function saveAuthSession(payload) {
        if (!payload || !payload.access_token) return;
        localStorage.setItem(AUTH_KEYS.access, payload.access_token);
        if (payload.refresh_token) localStorage.setItem(AUTH_KEYS.refresh, payload.refresh_token);
        if (payload.user_id) localStorage.setItem(AUTH_KEYS.userId, payload.user_id);
        if (payload.email) localStorage.setItem(AUTH_KEYS.email, payload.email);

        const displayName = payload.username || payload.email || 'User';
        localStorage.setItem('currentUser', displayName);
        localStorage.setItem('username', displayName);
    }

    function getAccessToken() {
        return localStorage.getItem(AUTH_KEYS.access);
    }

    function getAuthHeaders(extraHeaders) {
        const headers = { ...(extraHeaders || {}) };
        const token = getAccessToken();
        if (token) headers.Authorization = `Bearer ${token}`;
        if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
        return headers;
    }

    function clearAuthSession() {
        Object.values(AUTH_KEYS).forEach((key) => localStorage.removeItem(key));
        localStorage.removeItem('currentUser');
        localStorage.removeItem('username');
    }

    function isAuthenticated() {
        return !!getAccessToken();
    }

    function parseJwt(token) {
        try {
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
            return JSON.parse(jsonPayload);
        } catch (e) {
            return null;
        }
    }

    function isTokenExpired(token) {
        const payload = parseJwt(token);
        if (!payload || !payload.exp) return true;
        const currentTime = Math.floor(Date.now() / 1000);
        // Expired if within 5 minutes of expiration time
        return payload.exp < (currentTime + 300);
    }

    function requireAuth() {
        if (!isAuthenticated()) {
            if (window.top !== window.self) {
                window.top.location.href = 'login.html';
            } else {
                window.location.href = 'login.html';
            }
            return false;
        }
        return true;
    }

    // Intercept fetch to automatically refresh expired tokens or redirect on 401
    const originalFetch = window.fetch;
    window.fetch = async function (resource, options = {}) {
        const urlStr = typeof resource === 'string' ? resource : (resource.url || '');
        
        // Only run silent refresh check for API calls (excluding auth endpoints themselves)
        if (urlStr.includes('/api/') && !urlStr.includes('/api/login') && !urlStr.includes('/api/register') && !urlStr.includes('/api/refresh')) {
            const token = localStorage.getItem(AUTH_KEYS.access);
            if (token && isTokenExpired(token)) {
                const refreshToken = localStorage.getItem(AUTH_KEYS.refresh);
                if (refreshToken) {
                    try {
                        const refreshRes = await originalFetch('/api/refresh', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ refresh_token: refreshToken })
                        });
                        if (refreshRes.ok) {
                            const refreshData = await refreshRes.json();
                            if (refreshData.success) {
                                saveAuthSession(refreshData);
                                // Update Authorization header in options
                                if (!options.headers) {
                                    options.headers = {};
                                }
                                if (options.headers instanceof Headers) {
                                    options.headers.set('Authorization', `Bearer ${refreshData.access_token}`);
                                } else if (Array.isArray(options.headers)) {
                                    const idx = options.headers.findIndex(h => h[0].toLowerCase() === 'authorization');
                                    if (idx !== -1) options.headers[idx][1] = `Bearer ${refreshData.access_token}`;
                                    else options.headers.push(['Authorization', `Bearer ${refreshData.access_token}`]);
                                } else {
                                    options.headers['Authorization'] = `Bearer ${refreshData.access_token}`;
                                }
                            }
                        }
                    } catch (e) {
                        console.error('Silent session refresh failed:', e);
                    }
                }
            }
        }

        const response = await originalFetch(resource, options);

        // Global 401 interceptor
        if (response.status === 401 && urlStr.includes('/api/')) {
            const clone = response.clone();
            try {
                const data = await clone.json();
                if (data.message === 'Invalid access token' || data.message === 'JWT expired' || data.message === 'fetch failed') {
                    clearAuthSession();
                    if (window.top !== window.self) {
                        window.top.location.href = 'login.html';
                    } else {
                        window.location.href = 'login.html';
                    }
                }
            } catch (err) {
                // Not JSON or other error
            }
        }

        return response;
    };

    function buildFeedbackFromEvaluation(evaluation) {
        const breakdown = evaluation.breakdown || {};
        const to25 = (value) => Math.round((Number(value) || 0) * 5);
        return {
            breakdown: {
                taskAchievement: to25(breakdown.taskAchievement),
                organization: to25(breakdown.organization),
                languageUse: to25(breakdown.languageUse),
                grammar: to25(breakdown.grammar)
            },
            strengths: evaluation.strengths || [],
            improvements: evaluation.weaknesses || evaluation.improvements || [],
            detailedFeedback: evaluation.detailedFeedback || ''
        };
    }

    function scoreFromEvaluation(evaluation) {
        if (typeof evaluation.scaledScore === 'number') {
            return Math.round((evaluation.scaledScore / 30) * 100);
        }
        if (typeof evaluation.overallScore === 'number') {
            return Math.round(evaluation.overallScore);
        }
        if (typeof evaluation.rawScore === 'number') {
            return Math.round((evaluation.rawScore / 5) * 100);
        }
        return 0;
    }

    async function savePracticeSession(payload) {
        if (!isAuthenticated()) return { success: false, message: 'Not authenticated' };
        const response = await fetch('/api/sessions', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        });
        return response.json();
    }

    function handleOAuthCallbackFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const accessToken = params.get('access_token');
        if (!accessToken) return false;

        saveAuthSession({
            access_token: accessToken,
            refresh_token: params.get('refresh_token') || '',
            user_id: params.get('user_id') || '',
            email: params.get('email') || '',
            username: params.get('email') || 'User'
        });

        window.history.replaceState({}, document.title, window.location.pathname);
        window.location.href = 'dashboard.html';
        return true;
    }

    window.PhoenixAuth = {
        saveAuthSession,
        getAccessToken,
        getAuthHeaders,
        clearAuthSession,
        isAuthenticated,
        requireAuth,
        buildFeedbackFromEvaluation,
        scoreFromEvaluation,
        savePracticeSession,
        handleOAuthCallbackFromUrl
    };
})();
