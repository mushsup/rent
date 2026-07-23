import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bike, AlertCircle } from 'lucide-react';
import { signIn } from '../../features/auth/api';

export default function AdminLogin() {
    useEffect(() => {
        document.title = "Авторизация — E-Bike Admin";
    }, []);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            await signIn(email, password);
            navigate('/admin');
        } catch {
            setError('Неверный логин или пароль');
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full space-y-8 bg-gray-800 p-8 rounded-2xl shadow-2xl border border-gray-700">
                <div className="text-center">
                    <Bike className="mx-auto h-12 w-12 text-indigo-400" />
                    <h2 className="mt-6 text-3xl font-extrabold text-white">Вход</h2>
                </div>
                <form className="mt-8 space-y-6" onSubmit={handleLogin}>
                    {error && (
                        <div className="rounded-md bg-red-900/50 p-4 border border-red-800">
                            <div className="flex">
                                <div className="flex-shrink-0">
                                    <AlertCircle className="h-5 w-5 text-red-400" aria-hidden="true" />
                                </div>
                                <div className="ml-3">
                                    <h3 className="text-sm font-medium text-red-200">{error}</h3>
                                </div>
                            </div>
                        </div>
                    )}
                    <div className="rounded-md shadow-sm space-y-4">
                        <div>
                            <input
                                id="email-address"
                                name="email"
                                type="email"
                                autoComplete="email"
                                required
                                className="appearance-none relative block w-full px-3 py-2 bg-gray-700 border border-gray-600 placeholder-gray-400 text-white rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                placeholder="Email адрес"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                        <div>
                            <input
                                id="password"
                                name="password"
                                type="password"
                                autoComplete="current-password"
                                required
                                className="appearance-none relative block w-full px-3 py-2 bg-gray-700 border border-gray-600 placeholder-gray-400 text-white rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                placeholder="Пароль"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                    </div>

                    <div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 focus:ring-offset-gray-900 transition-colors disabled:opacity-50"
                        >
                            {loading ? 'Вход...' : 'Войти'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
