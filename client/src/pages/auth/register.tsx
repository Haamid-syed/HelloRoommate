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

export default function RegisterPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'TENANT' | 'OWNER'>('TENANT');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post('/auth/register', { name, email, password, role });
      setAuth(data.data.user, data.data.accessToken);
      toast.success('Account created!');
      navigate('/dashboard');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: { message?: string } } } };
      toast.error(error.response?.data?.error?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left — Hero panel */}
      <div className="hidden lg:flex lg:w-[52%] relative overflow-hidden flex-col justify-between p-12">
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse 70% 60% at 70% 30%, hsl(37 78% 60% / 0.14) 0%, transparent 55%), radial-gradient(ellipse 80% 70% at 10% 80%, hsl(37 78% 60% / 0.08) 0%, transparent 50%), hsl(22, 12%, 6%)',
          }}
        />
        <div className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: 'linear-gradient(hsl(38 40% 93%) 1px, transparent 1px), linear-gradient(90deg, hsl(38 40% 93%) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />

        {/* Logo */}
        <motion.div className="relative" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, hsl(37 78% 60%), hsl(33 64% 48%))' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M3 9.5L12 3L21 9.5V21H15V15H9V21H3V9.5Z" fill="hsl(22, 12%, 6%)" />
              </svg>
            </div>
            <span className="font-serif text-xl font-semibold text-foreground">
              Room<span className="text-gold">Finder</span>
            </span>
          </div>
        </motion.div>

        {/* Hero content */}
        <motion.div className="relative space-y-6"
          initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="label-overline">Join the community</p>
          <h1 className="font-serif text-display-lg text-foreground leading-[1.1]">
            Your perfect<br />
            <span className="italic text-gold">room awaits.</span>
          </h1>
          <p className="text-muted-foreground text-lg max-w-sm leading-relaxed">
            Create an account as a tenant looking for a room, or as an owner with a room to fill. AI handles the matching.
          </p>

          {/* Role cards */}
          <div className="space-y-3 pt-2">
            {[
              { emoji: '🔍', role: 'Tenant', desc: 'Browse AI-ranked listings that fit your preferences.' },
              { emoji: '🏠', role: 'Owner', desc: 'List your room and receive qualified tenant matches.' },
            ].map((item) => (
              <div key={item.role} className="flex items-center gap-4 card-elevated rounded-xl p-4">
                <span className="text-2xl">{item.emoji}</span>
                <div>
                  <p className="font-semibold text-sm text-foreground">{item.role}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.p className="relative text-xs text-muted-foreground"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
        >
          Free to use · No listing fees · Powered by AI
        </motion.p>
      </div>

      {/* Right — Form panel */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 lg:p-16">
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
            <h2 className="font-serif text-display-sm text-foreground">Create account</h2>
            <p className="text-muted-foreground mt-2 text-sm">Get started in seconds — it's free</p>
          </motion.div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            {/* Role selector */}
            <motion.div custom={1} variants={fadeUp} initial="hidden" animate="visible">
              <label className="block text-xs font-medium text-muted-foreground mb-3 tracking-wide uppercase">
                I am a
              </label>
              <div className="grid grid-cols-2 gap-3">
                {([['TENANT', '🔍 Tenant'], ['OWNER', '🏠 Owner']] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setRole(value)}
                    className="h-12 rounded-lg font-medium text-sm transition-all duration-200"
                    style={{
                      background: role === value ? 'linear-gradient(135deg, hsl(37 78% 60%), hsl(33 64% 48%))' : 'hsl(var(--surface-2))',
                      color: role === value ? 'hsl(22, 12%, 6%)' : 'hsl(var(--muted-foreground))',
                      border: role === value ? '1px solid transparent' : '1px solid hsl(var(--border))',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </motion.div>

            <motion.div custom={2} variants={fadeUp} initial="hidden" animate="visible">
              <label htmlFor="name" className="block text-xs font-medium text-muted-foreground mb-2 tracking-wide uppercase">
                Full Name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Doe"
                required
                minLength={2}
                className="input-dark w-full h-12 px-4 text-sm"
              />
            </motion.div>

            <motion.div custom={3} variants={fadeUp} initial="hidden" animate="visible">
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

            <motion.div custom={4} variants={fadeUp} initial="hidden" animate="visible">
              <label htmlFor="password" className="block text-xs font-medium text-muted-foreground mb-2 tracking-wide uppercase">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  required
                  minLength={8}
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

            <motion.div custom={5} variants={fadeUp} initial="hidden" animate="visible" className="pt-2">
              <button
                type="submit"
                disabled={loading}
                id="register-submit"
                className="btn-gold w-full h-12 text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-background/30 border-t-background rounded-full animate-spin" />
                ) : (
                  <>
                    Create Account
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </motion.div>
          </form>

          <motion.div
            custom={6} variants={fadeUp} initial="hidden" animate="visible"
            className="mt-6 text-center text-sm text-muted-foreground"
          >
            Already have an account?{' '}
            <Link to="/login" className="text-gold font-semibold hover:underline underline-offset-4">
              Sign in
            </Link>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
