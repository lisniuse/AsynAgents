import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '@/stores/appStore';
import { SunIcon, MoonIcon, MonitorIcon, CheckIcon } from '@/components/icons';
import type { ThemeMode } from '@/types';
import './ThemeToggle.less';

const themeOptions: { value: ThemeMode; label: string; icon: React.ReactNode }[] = [
  { value: 'light', label: '浅色', icon: <SunIcon size={16} /> },
  { value: 'dark', label: '深色', icon: <MoonIcon size={16} /> },
  { value: 'system', label: '跟随系统', icon: <MonitorIcon size={16} /> },
];

export const ThemeToggle: React.FC = () => {
  const { themeMode, setThemeMode } = useAppStore();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentOption = themeOptions.find((o) => o.value === themeMode) ?? themeOptions[2];

  return (
    <div className="theme-toggle" ref={dropdownRef}>
      <button
        className="theme-toggle-btn"
        onClick={() => setIsOpen(!isOpen)}
        title="切换主题"
      >
        {currentOption.icon}
      </button>
      {isOpen && (
        <div className="theme-dropdown">
          {themeOptions.map((option) => (
            <button
              key={option.value}
              className={`theme-option ${themeMode === option.value ? 'active' : ''}`}
              onClick={() => {
                setThemeMode(option.value);
                setIsOpen(false);
              }}
            >
              {option.icon}
              <span>{option.label}</span>
              {themeMode === option.value && <CheckIcon size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
