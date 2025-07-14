'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useState } from 'react';

import { AuthForm } from '@/components/auth-form';
import { SubmitButton } from '@/components/submit-button';

import { register, type RegisterActionState } from '../actions';
import { toast } from '@/components/toast';
import { useSession } from 'next-auth/react';

export default function Page() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [isSuccessful, setIsSuccessful] = useState(false);

  const [state, formAction] = useActionState<RegisterActionState, FormData>(
    register,
    {
      status: 'idle',
    },
  );

  const { update: updateSession } = useSession();

  useEffect(() => {
    if (state.status === 'user_exists') {
      toast({ type: 'error', description: 'Account already exists!' });
    } else if (state.status === 'failed') {
      toast({ type: 'error', description: 'Failed to create account!' });
    } else if (state.status === 'invalid_data') {
      toast({
        type: 'error',
        description: 'Failed validating your submission!',
      });
    } else if (state.status === 'success') {
      toast({ type: 'success', description: 'Account created successfully!' });

      setIsSuccessful(true);
      updateSession();
      router.refresh();
    }
  }, [state, router, updateSession]);

  const handleSubmit = (formData: FormData) => {
    setEmail(formData.get('email') as string);
    formAction(formData);
  };

  return (
    <div className="flex h-dvh w-screen">
      {/* Left side - Building Plans Start Background */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-2/3 relative overflow-hidden">
        {/* Building plans background with construction theme */}
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 via-blue-50 to-slate-100 dark:from-slate-900 dark:via-emerald-900 dark:to-blue-900">
          {/* Technical drawing grid pattern */}
          <div 
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage: `
                linear-gradient(rgba(16, 185, 129, 0.15) 2px, transparent 2px),
                linear-gradient(90deg, rgba(16, 185, 129, 0.15) 2px, transparent 2px),
                linear-gradient(rgba(59, 130, 246, 0.1) 1px, transparent 1px),
                linear-gradient(90deg, rgba(59, 130, 246, 0.1) 1px, transparent 1px)
              `,
              backgroundSize: '60px 60px, 60px 60px, 20px 20px, 20px 20px'
            }}
          />
          
          {/* Architectural compass rose */}
          <div className="absolute top-20 right-20 w-32 h-32 opacity-10 dark:opacity-5">
            <svg viewBox="0 0 100 100" className="w-full h-full text-emerald-600">
              <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="1"/>
              <path d="M50,5 L55,20 L50,15 L45,20 Z" fill="currentColor"/>
              <path d="M95,50 L80,45 L85,50 L80,55 Z" fill="currentColor"/>
              <path d="M50,95 L45,80 L50,85 L55,80 Z" fill="currentColor"/>
              <path d="M5,50 L20,55 L15,50 L20,45 Z" fill="currentColor"/>
              <text x="50" y="35" textAnchor="middle" className="text-xs font-bold">N</text>
            </svg>
          </div>
          
          {/* Architectural title block */}
          <div className="absolute bottom-20 right-20 p-4 bg-white/20 dark:bg-slate-800/30 backdrop-blur-sm border border-emerald-200/30 dark:border-emerald-700/30 rounded-lg">
            <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
              <div className="font-semibold">PROJECT: New Construction</div>
              <div>DRAWING: Site Plan</div>
              <div>SCALE: 1/4&quot; = 1&apos;-0&quot;</div>
              <div>DATE: {new Date().toLocaleDateString()}</div>
            </div>
          </div>
          
          {/* Construction elements overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-white/90 via-transparent to-white/50 dark:from-slate-900/90 dark:via-transparent dark:to-slate-900/50" />
        </div>
        
        {/* Sign up welcome content */}
        <div className="relative z-10 flex flex-col justify-center px-12 xl:px-20">
          <div className="max-w-md">
            <div className="mb-4">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                🏗️ Start Building
              </span>
            </div>
            
            <h1 className="text-4xl xl:text-5xl font-bold text-slate-900 dark:text-white mb-6 leading-tight">
              Begin Your Journey with{' '}
              <span className="text-emerald-600 dark:text-emerald-400">BuildRight</span>
            </h1>
            
            <p className="text-lg xl:text-xl text-slate-600 dark:text-slate-300 leading-relaxed mb-6">
              Every great construction project starts with a plan. Join thousands of architects, 
              engineers, and builders who trust BuildRight for intelligent code compliance.
            </p>
            
            <div className="bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm rounded-lg p-6 border border-emerald-200/30 dark:border-emerald-700/30">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-4">
                🚀 Get Started Today
              </h3>
              
              {/* Features list */}
              <div className="space-y-3">
                <div className="flex items-center text-slate-700 dark:text-slate-300">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full mr-3 flex-shrink-0" />
                  <span className="text-sm">Instant account activation</span>
                </div>
                <div className="flex items-center text-slate-700 dark:text-slate-300">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full mr-3 flex-shrink-0" />
                  <span className="text-sm">Free document analysis</span>
                </div>
                <div className="flex items-center text-slate-700 dark:text-slate-300">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full mr-3 flex-shrink-0" />
                  <span className="text-sm">AI-powered insights</span>
                </div>
                <div className="flex items-center text-slate-700 dark:text-slate-300">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full mr-3 flex-shrink-0" />
                  <span className="text-sm">Secure cloud storage</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Right side - Sign Up form */}
      <div className="flex w-full lg:w-1/2 xl:w-1/3 items-center justify-center bg-white dark:bg-slate-950 p-8">
        <div className="w-full max-w-md">
          {/* Mobile header for smaller screens */}
          <div className="lg:hidden text-center mb-8">
            <div className="mb-3">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                🏗️ Start Building
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
              <span className="text-emerald-600 dark:text-emerald-400">BuildRight</span>
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Create your account and start your first project.
            </p>
          </div>
          
          {/* Sign up form */}
          <div className="flex flex-col gap-8">
            <div className="text-center lg:text-left">
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-2">
                Create Your Account
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Join the future of building code compliance
              </p>
            </div>
            
        <AuthForm action={handleSubmit} defaultEmail={email}>
              <SubmitButton isSuccessful={isSuccessful}>
                Start Building with BuildRight
              </SubmitButton>
              <p className="text-center text-sm text-slate-600 mt-4 dark:text-slate-400">
            {'Already have an account? '}
            <Link
              href="/login"
                  className="font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 transition-colors"
            >
              Sign in
            </Link>
            {' instead.'}
          </p>
              
              <div className="text-center mt-4">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  By signing up, you agree to our terms and conditions. 
                  No spam, ever. 🏗️
                </p>
              </div>
        </AuthForm>
          </div>
        </div>
      </div>
    </div>
  );
}
