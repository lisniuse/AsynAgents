import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '@/stores/appStore';
import type { AppSettings } from '@/stores/appStore';
import { useT } from '@/i18n';
import { BoltIcon, ToolIcon, MonitorIcon, BrainIcon } from '@/components/icons';
import './SettingsModal.less';

interface SettingsModalProps {
  onClose: () => void;
}

const DEFAULT_UI = { showToolCalls: true, language: 'zh' as const, userLanguage: 'auto' as const };
const DEFAULT_PERSONA = { aiName: '', userName: '', personality: '' };

type Section = 'model' | 'workspace' | 'ui' | 'persona';

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const t = useT();
  const { settings, saveSettings } = useAppStore();
  const [form, setForm] = useState<AppSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeSection, setActiveSection] = useState<Section>('model');

  useEffect(() => {
    if (settings) {
      const copy = JSON.parse(JSON.stringify(settings));
      if (!copy.ui) copy.ui = { ...DEFAULT_UI };
      else copy.ui = { ...DEFAULT_UI, ...copy.ui };
      setForm(copy);
    }
  }, [settings]);

  if (!form) return null;

  const ui = form.ui ?? DEFAULT_UI;
  const persona = form.persona ?? DEFAULT_PERSONA;
  const setPersonaField = (k: keyof typeof DEFAULT_PERSONA, v: string) =>
    setForm({ ...form, persona: { ...persona, [k]: v } });

  const setProvider = (v: string) => setForm({ ...form, provider: v });
  const setAnthropicField = (k: keyof AppSettings['anthropic'], v: string) =>
    setForm({ ...form, anthropic: { ...form.anthropic, [k]: v } });
  const setOpenAIField = (k: keyof AppSettings['openai'], v: string) =>
    setForm({ ...form, openai: { ...form.openai, [k]: v } });
  const setWorkspace = (v: string) => setForm({ ...form, workspace: v });
  const setUiField = (patch: Partial<typeof DEFAULT_UI>) =>
    setForm({ ...form, ui: { ...ui, ...patch } });

  const handleSave = async () => {
    setSaving(true);
    await saveSettings(form);
    setSaving(false);
    setSaved(true);
    setTimeout(() => onClose(), 800);
  };

  const navItems: { key: Section; label: string; icon: React.ReactNode }[] = [
    { key: 'model',     label: t.modelConfig,      icon: <BoltIcon size={15} /> },
    { key: 'workspace', label: t.workspaceSection,  icon: <ToolIcon size={15} /> },
    { key: 'ui',        label: t.uiSection,         icon: <MonitorIcon size={15} /> },
    { key: 'persona',   label: t.personaSection,    icon: <BrainIcon size={15} /> },
  ];

  return createPortal(
    <div className="settings-overlay" onMouseDown={onClose}>
      <div className="settings-modal" onMouseDown={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="settings-header">
          <div className="settings-title">{t.settingsTitle}</div>
          <button className="settings-close" onClick={onClose}>✕</button>
        </div>

        {/* Body: sidebar + content */}
        <div className="settings-layout">
          <nav className="settings-nav">
            {navItems.map((item) => (
              <button
                key={item.key}
                className={`settings-nav-item ${activeSection === item.key ? 'active' : ''}`}
                onClick={() => setActiveSection(item.key)}
              >
                <span className="settings-nav-icon">{item.icon}</span>
                <span className="settings-nav-label">{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="settings-content">
            {/* 模型配置 */}
            {activeSection === 'model' && (
              <div className="settings-section">
                <div className="settings-field">
                  <label>{t.apiProvider}</label>
                  <div className="provider-tabs">
                    <button
                      className={`provider-tab ${form.provider === 'openai' ? 'active' : ''}`}
                      onClick={() => setProvider('openai')}
                    >{t.openaiCompatible}</button>
                    <button
                      className={`provider-tab ${form.provider === 'anthropic' ? 'active' : ''}`}
                      onClick={() => setProvider('anthropic')}
                    >{t.anthropicProvider}</button>
                  </div>
                </div>

                {form.provider === 'openai' ? (
                  <>
                    <div className="settings-field">
                      <label>{t.apiKey}</label>
                      <input type="password" value={form.openai.apiKey}
                        onChange={(e) => setOpenAIField('apiKey', e.target.value)} placeholder="sk-..." />
                    </div>
                    <div className="settings-field">
                      <label>{t.baseUrl}</label>
                      <input type="text" value={form.openai.baseUrl}
                        onChange={(e) => setOpenAIField('baseUrl', e.target.value)} placeholder="https://api.openai.com/v1" />
                    </div>
                    <div className="settings-field">
                      <label>{t.modelField}</label>
                      <input type="text" value={form.openai.model}
                        onChange={(e) => setOpenAIField('model', e.target.value)} placeholder="gpt-4o" />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="settings-field">
                      <label>{t.apiKey}</label>
                      <input type="password" value={form.anthropic.apiKey}
                        onChange={(e) => setAnthropicField('apiKey', e.target.value)} placeholder="sk-ant-..." />
                    </div>
                    <div className="settings-field">
                      <label>{t.baseUrl} <span className="field-optional">{t.optional}</span></label>
                      <input type="text" value={form.anthropic.baseUrl ?? ''}
                        onChange={(e) => setAnthropicField('baseUrl', e.target.value)} placeholder="https://api.anthropic.com" />
                    </div>
                    <div className="settings-field">
                      <label>{t.modelField}</label>
                      <input type="text" value={form.anthropic.model}
                        onChange={(e) => setAnthropicField('model', e.target.value)} placeholder="claude-opus-4-6" />
                    </div>
                  </>
                )}

                <div className="field-hint" style={{ marginTop: 8 }}>{t.restartHint}</div>
              </div>
            )}

            {/* 工作区 */}
            {activeSection === 'workspace' && (
              <div className="settings-section">
                <div className="settings-field">
                  <label>{t.workspaceDir}</label>
                  <input type="text" value={form.workspace}
                    onChange={(e) => setWorkspace(e.target.value)} placeholder="~/.asynagents/workspace" />
                  <div className="field-hint">{t.workspaceDirHint}</div>
                </div>
              </div>
            )}

            {/* 界面 */}
            {activeSection === 'ui' && (
              <div className="settings-section">
                <div className="settings-field">
                  <label>{t.interfaceLanguage}</label>
                  <div className="provider-tabs">
                    <button className={`provider-tab ${ui.language === 'zh' ? 'active' : ''}`}
                      onClick={() => setUiField({ language: 'zh' })}>中文</button>
                    <button className={`provider-tab ${ui.language === 'en' ? 'active' : ''}`}
                      onClick={() => setUiField({ language: 'en' })}>English</button>
                  </div>
                </div>

                <div className="settings-field">
                  <label>{t.userLanguageLabel}</label>
                  <div className="provider-tabs">
                    <button className={`provider-tab ${ui.userLanguage === 'auto' ? 'active' : ''}`}
                      onClick={() => setUiField({ userLanguage: 'auto' })}>Auto</button>
                    <button className={`provider-tab ${ui.userLanguage === 'zh' ? 'active' : ''}`}
                      onClick={() => setUiField({ userLanguage: 'zh' })}>中文</button>
                    <button className={`provider-tab ${ui.userLanguage === 'en' ? 'active' : ''}`}
                      onClick={() => setUiField({ userLanguage: 'en' })}>English</button>
                  </div>
                  <div className="field-hint">{t.userLanguageHint}</div>
                </div>

                <div className="settings-field settings-field-toggle">
                  <div className="toggle-label">
                    <span>{t.showToolCallsByDefault}</span>
                    <span className="field-hint">{t.showToolCallsByDefaultHint}</span>
                  </div>
                  <button className={`toggle-switch ${ui.showToolCalls ? 'on' : ''}`}
                    onClick={() => setUiField({ showToolCalls: !ui.showToolCalls })}>
                    <span className="toggle-knob" />
                  </button>
                </div>
              </div>
            )}
            {/* 角色 */}
            {activeSection === 'persona' && (
              <div className="settings-section">
                <div className="settings-field">
                  <label>{t.aiName}</label>
                  <input type="text" value={persona.aiName}
                    onChange={(e) => setPersonaField('aiName', e.target.value)}
                    placeholder={t.aiNamePlaceholder} />
                  <div className="field-hint">{t.aiNameHint}</div>
                </div>
                <div className="settings-field">
                  <label>{t.userName}</label>
                  <input type="text" value={persona.userName}
                    onChange={(e) => setPersonaField('userName', e.target.value)}
                    placeholder={t.userNamePlaceholder} />
                  <div className="field-hint">{t.userNameHint}</div>
                </div>
                <div className="settings-field">
                  <label>{t.personality}</label>
                  <textarea
                    className="settings-textarea"
                    value={persona.personality}
                    onChange={(e) => setPersonaField('personality', e.target.value)}
                    placeholder={t.personalityPlaceholder}
                    rows={4}
                  />
                  <div className="field-hint">{t.personalityHint}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="settings-footer">
          <div className="settings-actions">
            <button className="settings-cancel" onClick={onClose}>{t.cancel}</button>
            <button className="settings-save" onClick={handleSave} disabled={saving}>
              {saved ? t.saved : saving ? t.saving : t.save}
            </button>
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
};
