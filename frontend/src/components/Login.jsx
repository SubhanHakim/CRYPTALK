import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react'; // Added useEffect import
import { api, API_URL } from '../lib/api';

export default function Login() {
    const navigate = useNavigate();

    useEffect(() => {
        // Check for token in URL (redirected from Backend)
        const params = new URLSearchParams(window.location.search);
        const token = params.get('token');
        const username = params.get('user');
        const uid = params.get('uid');

        if (token && username && uid) {
            localStorage.setItem('token', token);
            localStorage.setItem('user', JSON.stringify({ username, id: uid }));
            navigate('/chat');
        }
    }, [navigate]);

    const handleLogin = () => {
        // Redirect to Backend Login logic
        window.location.href = `${API_URL}/auth/login`;
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-900">
            <div className="p-8 bg-gray-800 rounded-lg shadow-xl text-center">
                <h1 className="text-3xl font-bold text-white mb-6">Welcome to SecureChat</h1>
                <button
                    onClick={handleLogin}
                    className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold transition-colors"
                >
                    Sign in with Google
                </button>
                <div className="mt-8 text-center text-xs text-gray-500">
                    <button onClick={() => window.location.href = '/benchmark'} className="text-gray-400 hover:text-white underline">
                        Run Crypto Benchmark
                    </button>
                    <p className="mt-2">SecureChat AG &copy; 2025</p>
                </div>
            </div>
        </div>
    );
}
