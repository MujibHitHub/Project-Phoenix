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

    function requireAuth() {
        if (!isAuthenticated()) {
            window.location.href = 'login.html';
            return false;
        }
        return true;
    }

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
