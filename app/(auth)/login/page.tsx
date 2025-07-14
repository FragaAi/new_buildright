'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useState } from 'react';
import { toast } from '@/components/toast';

import { AuthForm } from '@/components/auth-form';
import { SubmitButton } from '@/components/submit-button';

import { login, type LoginActionState } from '../actions';
import { useSession } from 'next-auth/react';

export default function Page() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [isSuccessful, setIsSuccessful] = useState(false);

  const [state, formAction] = useActionState<LoginActionState, FormData>(
    login,
    {
      status: 'idle',
    },
  );

  const { update: updateSession } = useSession();

  useEffect(() => {
    if (state.status === 'failed') {
      toast({
        type: 'error',
        description: 'Invalid credentials!',
      });
    } else if (state.status === 'invalid_data') {
      toast({
        type: 'error',
        description: 'Failed validating your submission!',
      });
    } else if (state.status === 'success') {
      setIsSuccessful(true);
      updateSession();
      router.refresh();
    }
  }, [state.status, router, updateSession]);

  const handleSubmit = (formData: FormData) => {
    setEmail(formData.get('email') as string);
    formAction(formData);
  };

  return (
    <div className="flex h-dvh w-screen">
      {/* Left side - Architectural background */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-2/3 relative">
        {/* Architectural plan background pattern */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-slate-100 dark:from-slate-900 dark:to-blue-900">
          {/* Blueprint grid pattern */}
          <div 
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: `
                linear-gradient(rgba(59, 130, 246, 0.1) 1px, transparent 1px),
                linear-gradient(90deg, rgba(59, 130, 246, 0.1) 1px, transparent 1px)
              `,
              backgroundSize: '20px 20px'
            }}
          />
          {/* Architectural elements overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-white/80 via-transparent to-white/40 dark:from-slate-900/80 dark:via-transparent dark:to-slate-900/40" />
        </div>
        
        {/* Welcome content */}
        <div className="relative z-10 flex flex-col justify-center px-12 xl:px-20">
          <div className="max-w-md">
            <h1 className="text-4xl xl:text-5xl font-bold text-slate-900 dark:text-white mb-6">
              Welcome back to{' '}
              <span className="text-blue-600 dark:text-blue-400">BuildRight</span>
            </h1>
            <p className="text-lg xl:text-xl text-slate-600 dark:text-slate-300 leading-relaxed">
              Your intelligent building code compliance and architectural analysis platform. 
              Continue where you left off and streamline your construction projects.
            </p>
            
            {/* Architectural features list */}
            <div className="mt-8 space-y-3">
              <div className="flex items-center text-slate-700 dark:text-slate-300">
                <div className="w-2 h-2 bg-blue-500 rounded-full mr-3" />
                <span>AI-powered building code analysis</span>
              </div>
              <div className="flex items-center text-slate-700 dark:text-slate-300">
                <div className="w-2 h-2 bg-blue-500 rounded-full mr-3" />
                <span>Automated compliance checking</span>
              </div>
              <div className="flex items-center text-slate-700 dark:text-slate-300">
                <div className="w-2 h-2 bg-blue-500 rounded-full mr-3" />
                <span>Intelligent document processing</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Right side - Login form */}
      <div className="flex w-full lg:w-1/2 xl:w-1/3 items-center justify-center bg-white dark:bg-slate-950 p-8">
        <div className="w-full max-w-md">
          {/* Mobile header for smaller screens */}
          <div className="lg:hidden text-center mb-8">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
              <span className="text-blue-600 dark:text-blue-400">BuildRight</span>
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Welcome back! Sign in to continue.
            </p>
          </div>
          
          {/* Login form */}
          <div className="flex flex-col gap-8">
            <div className="text-center lg:text-left">
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-2">
                Sign In
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Enter your credentials to access your dashboard
              </p>
            </div>
            
        <AuthForm action={handleSubmit} defaultEmail={email}>
          <SubmitButton isSuccessful={isSuccessful}>Sign in</SubmitButton>
              <p className="text-center text-sm text-slate-600 mt-4 dark:text-slate-400">
            {"Don't have an account? "}
            <Link
              href="/register"
                  className="font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
            >
              Sign up
            </Link>
            {' for free.'}
          </p>
        </AuthForm>
          </div>
        </div>
      </div>
    </div>
  );
}
