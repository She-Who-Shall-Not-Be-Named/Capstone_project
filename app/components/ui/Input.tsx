"use client";
import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  className?: string;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  hint,
  leftIcon,
  rightIcon,
  className = "",
  id,
  ...rest
}) => {
  const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`;
  
  const baseInputClasses = "w-full rounded-xl border bg-white px-3.5 py-2.5 text-slate-900 placeholder:text-slate-500 transition-all duration-200 focus:outline-none";
  
  const stateClasses = error 
    ? "border-red-500 focus:ring-2 focus:ring-red-500 focus:border-transparent" 
    : "border-slate-300 focus:ring-2 focus:ring-orange-500 focus:border-transparent";

  const paddingClasses = leftIcon ? "pl-10" : rightIcon ? "pr-10" : "";
  
  const combinedInputClasses = `${baseInputClasses} ${stateClasses} ${paddingClasses} ${className}`.trim();

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-slate-900 mb-2">
          {label}
        </label>
      )}
      
      <div className="relative">
        {leftIcon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            {leftIcon}
          </div>
        )}
        
        <input
          id={inputId}
          className={combinedInputClasses}
          {...rest}
        />
        
        {rightIcon && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
            {rightIcon}
          </div>
        )}
      </div>
      
      {hint && !error && (
        <p className="text-slate-500 text-sm mt-1">{hint}</p>
      )}
      
      {error && (
        <p className="text-red-600 text-sm mt-1">{error}</p>
      )}
    </div>
  );
};
