import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '@/stores/appStore';
import type { AppSettings } from '@/stores/appStore';
import { useT } from '@/i18n';
import './SettingsModal.less';

interface SettingsModalProps {
  onClose: () => void;
}

const DEFAULT_UI = { showToolCalls: true, language: 'zh' as const, userLanguage: 'auto' as const };

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const t = useT();
  const { settings, saveSettings } = useAppStore();
  const [form, setForm] = useState<AppSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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
    setTimeout(() => setSaved(false), 2000);
  };

  return createPortal(
    <div className="settings-overlay" onMouseDown={onClose}>
      <div className="settings-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <div className="settings-title">{t.settingsTitle}</div>
          <button className="settings-close" onClick={onClose}>✕</button>
        </div>

        <div className="settings-body">
          {/* 模型配置 */}
          <div className="settings-section">
            <div className="settings-section-title">{t.modelConfig}</div>

            <div className="settings-field">
              <label>{t.apiProvider}</label>
              <div className="provider-tabs">
                <button
                  className={`provider-tab ${form.provider === 'openai' ? 'active' : ''}`}
                  onClick={() => setProvider('openai')}
                >
                  {t.openaiCompatible}
                </button>
                <button
                  className={`provider-tab ${form.provider === 'anthropic' ? 'active' : ''}`}
                  onClick={() => setProvider('anthropic')}
                >
                  {t.anthropicProvider}
                </button>
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
          </div>

          {/* 工作区 */}
          <div className="settings-section">
            <div className="settings-section-title">{t.workspaceSection}</div>
            <div className="settings-field">
              <label>{t.workspaceDir}</label>
              <input type="text" value={form.workspace}
                onChange={(e) => setWorkspace(e.target.value)} placeholder="~/.asynagents/workspace" />
              <div className="field-hint">{t.workspaceDirHint}</div>
            </div>
          </div>

          {/* 界面 */}
          <div className="settings-section">
            <div className="settings-section-title">{t.uiSection}</div>

            {/* 界面语言 */}
            <div className="settings-field">
              <label>{t.interfaceLanguage}</label>
              <div className="provider-tabs">
                <button className={`provider-tab ${ui.language === 'zh' ? 'active' : ''}`}
                  onClick={() => setUiField({ language: 'zh' })}>中文</button>
                <button className={`provider-tab ${ui.language === 'en' ? 'active' : ''}`}
                  onClick={() => setUiField({ language: 'en' })}>English</button>
              </div>
            </div>

            {/* AI 回复语言 */}
            <div className="settings-field">
              <label>{t.userLanguageLabel}</label>
              <div className="provider-tabs lang-tabs">
                <button className={`provider-tab ${ui.userLanguage === 'auto' ? 'active' : ''}`}
                  onClick={() => setUiField({ userLanguage: 'auto' })}>Auto</button>
                <button className={`provider-tab ${ui.userLanguage === 'zh' ? 'active' : ''}`}
                  onClick={() => setUiField({ userLanguage: 'zh' })}>中文</button>
                <button className={`provider-tab ${ui.userLanguage === 'en' ? 'active' : ''}`}
                  onClick={() => setUiField({ userLanguage: 'en' })}>English</button>
              </div>
              <div className="field-hint">{t.userLanguageHint}</div>
            </div>

            {/* 默认展开工具调用 */}
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
        </div>

        <div className="settings-footer">
          <div className="settings-hint">{t.restartHint}</div>
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
