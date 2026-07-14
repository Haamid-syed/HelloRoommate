import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { Eye, EyeOff, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.08, ease: EASE },
  }),
};

export default function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { email, password });
      setAuth(data.data.user, data.data.accessToken);
      toast.success('Welcome back!');
      navigate('/dashboard');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: { message?: string } } } };
      toast.error(error.response?.data?.error?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left — Hero panel */}
      <div className="hidden lg:flex lg:w-[52%] relative overflow-hidden flex-col justify-between p-12">
        {/* Gradient background */}
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse 80% 70% at 20% 60%, hsl(37 78% 60% / 0.18) 0%, transparent 60%), radial-gradient(ellipse 60% 80% at 80% 20%, hsl(22 14% 14%) 0%, hsl(22 12% 6%) 100%)',
          }}
        />

        {/* Decorative grid lines */}
        <div className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: 'linear-gradient(hsl(38 40% 93%) 1px, transparent 1px), linear-gradient(90deg, hsl(38 40% 93%) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />

        {/* Floating orb */}
        <div className="absolute bottom-1/4 right-1/4 w-72 h-72 rounded-full opacity-[0.06] animate-float"
          style={{ background: 'radial-gradient(circle, hsl(37 78% 60%) 0%, transparent 70%)' }}
        />

        {/* Logo */}
        <motion.div
          className="relative"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, hsl(37 78% 60%), hsl(33 64% 48%))' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M3 9.5L12 3L21 9.5V21H15V15H9V21H3V9.5Z" fill="hsl(22, 12%, 6%)" />
              </svg>
            </div>
            <span className="font-serif text-xl font-semibold text-foreground tracking-tight">
              Room<span className="text-gold">Finder</span>
            </span>
          </div>
        </motion.div>

        {/* Hero text */}
        <motion.div
          className="relative space-y-6"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="label-overline">AI-Powered Matching</p>
          <h1 className="font-serif text-display-lg text-foreground leading-[1.1]">
            Find where you<br />
            <span className="italic text-gold">truly belong.</span>
          </h1>
          <p className="text-muted-foreground text-lg max-w-sm leading-relaxed">
            Compatibility scoring, real-time chat, and smart notifications — all in one platform built for Mumbai's rental market.
          </p>

          {/* Testimonial / stats */}
          <div className="grid grid-cols-2 gap-4 pt-4">
            {[
              { value: '98%', label: 'Match accuracy' },
              { value: '2min', label: 'Avg. response time' },
            ].map((stat) => (
              <div key={stat.label} className="card-elevated rounded-xl p-4">
                <p className="font-serif text-2xl font-bold text-gold">{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Bottom credit */}
        <motion.p
          className="relative text-xs text-muted-foreground"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          Powered by OpenRouter AI · Socket.IO live chat
        </motion.p>
      </div>

      {/* Right — Form panel */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 lg:p-16 relative">
        {/* Mobile logo */}
        <div className="lg:hidden mb-10 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, hsl(37 78% 60%), hsl(33 64% 48%))' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M3 9.5L12 3L21 9.5V21H15V15H9V21H3V9.5Z" fill="hsl(22, 12%, 6%)" />
            </svg>
          </div>
          <span className="font-serif text-xl font-semibold text-foreground">
            Room<span className="text-gold">Finder</span>
          </span>
        </div>

        <div className="w-full max-w-md">
          <motion.div custom={0} variants={fadeUp} initial="hidden" animate="visible">
            <h2 className="font-serif text-display-sm text-foreground">Welcome back</h2>
            <p className="text-muted-foreground mt-2 text-sm">Sign in to continue your search</p>
          </motion.div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <motion.div custom={1} variants={fadeUp} initial="hidden" animate="visible">
              <label htmlFor="email" className="block text-xs font-medium text-muted-foreground mb-2 tracking-wide uppercase">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="input-dark w-full h-12 px-4 text-sm"
              />
            </motion.div>

            <motion.div custom={2} variants={fadeUp} initial="hidden" animate="visible">
              <label htmlFor="password" className="block text-xs font-medium text-muted-foreground mb-2 tracking-wide uppercase">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="input-dark w-full h-12 px-4 pr-12 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </motion.div>

            <motion.div custom={3} variants={fadeUp} initial="hidden" animate="visible" className="pt-2">
              <button
                type="submit"
                disabled={loading}
                id="login-submit"
                className="btn-gold w-full h-12 text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-background/30 border-t-background rounded-full animate-spin" />
                ) : (
                  <>
                    Sign In
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </motion.div>
          </form>

          <motion.div
            custom={4} variants={fadeUp} initial="hidden" animate="visible"
            className="mt-6 text-center text-sm text-muted-foreground"
          >
            Don't have an account?{' '}
            <Link to="/register" className="text-gold font-semibold hover:underline underline-offset-4">
              Create one
            </Link>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
