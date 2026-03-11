import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '@/stores/appStore';
import type { AppSettings, ConfigSaveResult } from '@/stores/appStore';
import type { ExperienceItem, SkillItem } from '@/types';
import { useT } from '@/i18n';
import {
  BoltIcon,
  ToolIcon,
  MonitorIcon,
  BrainIcon,
  ListManageIcon,
  MenuIcon,
  CloseIcon,
} from '@/components/icons';
import './SettingsModal.less';

interface SettingsModalProps {
  onClose: () => void;
}

type UiSettings = NonNullable<AppSettings['ui']>;
type Section = 'model' | 'workspace' | 'knowledge' | 'ui' | 'persona';

const DEFAULT_UI: UiSettings = {
  showToolCalls: true,
  autoCollapseToolCalls: false,
  language: 'zh',
  userLanguage: 'auto',
};
const DEFAULT_PERSONA = { aiName: '', userName: '', aiAvatar: '', userAvatar: '', personality: '' };
const DEFAULT_PYTHON = { path: 'python' };
const PERSONA_NAME_MAX_LENGTH = 32;
const PERSONA_NAME_ALLOWED = /[A-Za-z0-9_\u3400-\u9FFF]/gu;
const CLOSE_ANIMATION_MS = 180;

function sortSkills(skills: SkillItem[]): SkillItem[] {
  return [...skills].sort((a, b) => a.name.localeCompare(b.name));
}

function sortExperiences(experiences: ExperienceItem[]): ExperienceItem[] {
  return [...experiences].sort((a, b) => b.fileName.localeCompare(a.fileName));
}

function sanitizePersonaName(value: string): string {
  const matches = value.match(PERSONA_NAME_ALLOWED);
  return (matches ?? []).join('').slice(0, PERSONA_NAME_MAX_LENGTH);
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const t = useT();
  const {
    settings,
    saveSettings,
    skills,
    experiences,
    loadCatalog,
    toggleSkill,
    toggleExperience,
  } = useAppStore();
  const [form, setForm] = useState<AppSettings | null>(null);
  const [pythonStatus, setPythonStatus] = useState<{ available: boolean; path?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<Section>('model');
  const [togglingSkill, setTogglingSkill] = useState<string | null>(null);
  const [togglingExperience, setTogglingExperience] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const aiAvatarInputRef = useRef<HTMLInputElement>(null);
  const userAvatarInputRef = useRef<HTMLInputElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const saveCloseTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!settings) return;
    const copy = JSON.parse(JSON.stringify(settings)) as AppSettings;
    copy.python = { ...DEFAULT_PYTHON, ...copy.python };
    copy.ui = { ...DEFAULT_UI, ...copy.ui };
    copy.persona = { ...DEFAULT_PERSONA, ...copy.persona };
    copy.persona.aiName = sanitizePersonaName(copy.persona.aiName);
    copy.persona.userName = sanitizePersonaName(copy.persona.userName);
    setForm(copy);
  }, [settings]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [activeSection]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
      if (saveCloseTimerRef.current !== null) {
        window.clearTimeout(saveCloseTimerRef.current);
      }
    };
  }, []);

  const refreshPythonStatus = (data?: { pythonAvailable?: boolean; pythonPath?: string } | null) => {
    if (!data) return;
    setPythonStatus({
      available: Boolean(data.pythonAvailable),
      path: typeof data.pythonPath === 'string' ? data.pythonPath : undefined,
    });
  };

  useEffect(() => {
    let cancelled = false;

    fetch('/health')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        refreshPythonStatus(data);
      })
      .catch(() => {
        if (!cancelled) {
          setPythonStatus(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!form) return null;

  const ui = form.ui ?? DEFAULT_UI;
  const persona = form.persona ?? DEFAULT_PERSONA;

  const setPersonaField = (key: keyof typeof DEFAULT_PERSONA, value: string) => {
    setForm({
      ...form,
      persona: {
        ...persona,
        [key]: key === 'personality' ? value : sanitizePersonaName(value),
      },
    });
  };

  const handleAvatarSelected = async (
    key: 'aiAvatar' | 'userAvatar',
    file: File | undefined
  ) => {
    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      setSaveError(t.settingsAvatarInvalid);
      return;
    }

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            resolve(reader.result);
            return;
          }
          reject(new Error('Failed to read file'));
        };
        reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });

      setSaveError(null);
      setForm({
        ...form,
        persona: {
          ...persona,
          [key]: dataUrl,
        },
      });
    } catch {
      setSaveError(t.settingsAvatarReadFailed);
    }
  };

  const setProvider = (value: string) => setForm({ ...form, provider: value });
  const setAnthropicField = (key: keyof AppSettings['anthropic'], value: string) => {
    setForm({ ...form, anthropic: { ...form.anthropic, [key]: value } });
  };
  const setOpenAIField = (key: keyof AppSettings['openai'], value: string) => {
    setForm({ ...form, openai: { ...form.openai, [key]: value } });
  };
  const setPythonPath = (value: string) => {
    setForm({ ...form, python: { ...form.python, path: value } });
  };
  const setWorkspace = (value: string) => setForm({ ...form, workspace: value });
  const setUiField = (patch: Partial<UiSettings>) => {
    setForm({ ...form, ui: { ...ui, ...patch } });
  };

  const requestClose = () => {
    if (closing) {
      return;
    }

    setClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      onClose();
    }, CLOSE_ANIMATION_MS);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    const result = await saveSettings(form);
    setSaving(false);
    refreshPythonStatus(result as ConfigSaveResult | null);
    if (!result?.ok) {
      setSaveError(result?.error ?? t.settingsSaveFailed);
      return;
    }
    setSaved(true);
    saveCloseTimerRef.current = window.setTimeout(() => requestClose(), 800);
  };

  const handleToggleSkill = async (skill: SkillItem) => {
    setTogglingSkill(skill.name);
    await toggleSkill(skill.name, !skill.enabled);
    setTogglingSkill(null);
  };

  const handleToggleExperience = async (experience: ExperienceItem) => {
    setTogglingExperience(experience.fileName);
    await toggleExperience(experience.fileName, !experience.enabled);
    setTogglingExperience(null);
  };

  const navItems: { key: Section; label: string; icon: React.ReactNode }[] = [
    { key: 'model', label: t.modelConfig, icon: <BoltIcon size={15} /> },
    { key: 'workspace', label: t.workspaceSection, icon: <ToolIcon size={15} /> },
    { key: 'knowledge', label: t.knowledgeSection, icon: <ListManageIcon size={15} /> },
    { key: 'ui', label: t.uiSection, icon: <MonitorIcon size={15} /> },
    { key: 'persona', label: t.personaSection, icon: <BrainIcon size={15} /> },
  ];

  return createPortal(
    <div className={`settings-overlay ${closing ? 'is-closing' : ''}`} onMouseDown={requestClose}>
      <div
        className={`settings-modal ${closing ? 'is-closing' : ''}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="settings-header">
          <div className="settings-header-main">
            <button
              type="button"
              className="settings-menu-toggle"
              onClick={() => setMobileNavOpen(true)}
              aria-label={t.settingsTitle}
            >
              <MenuIcon size={18} />
            </button>
            <div className="settings-title">{t.settingsTitle}</div>
          </div>
          <button type="button" className="settings-close" onClick={requestClose} aria-label={t.cancel}>
            <CloseIcon size={18} />
          </button>
        </div>

        <div className="settings-layout">
          {mobileNavOpen && (
            <button
              type="button"
              className="settings-nav-backdrop"
              onClick={() => setMobileNavOpen(false)}
              aria-label={t.cancel}
            />
          )}

          <nav className={`settings-nav ${mobileNavOpen ? 'mobile-open' : ''}`}>
            {navItems.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`settings-nav-item ${activeSection === item.key ? 'active' : ''}`}
                onClick={() => {
                  setActiveSection(item.key);
                  setMobileNavOpen(false);
                }}
              >
                <span className="settings-nav-icon">{item.icon}</span>
                <span className="settings-nav-label">{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="settings-content">
            {activeSection === 'model' && (
              <div className="settings-section">
                <div className="settings-field">
                  <label>{t.apiProvider}</label>
                  <div className="provider-tabs">
                    <button
                      type="button"
                      className={`provider-tab ${form.provider === 'openai' ? 'active' : ''}`}
                      onClick={() => setProvider('openai')}
                    >
                      {t.openaiCompatible}
                    </button>
                    <button
                      type="button"
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
                      <input
                        type="password"
                        value={form.openai.apiKey}
                        onChange={(event) => setOpenAIField('apiKey', event.target.value)}
                        placeholder="sk-..."
                      />
                    </div>
                    <div className="settings-field">
                      <label>{t.baseUrl}</label>
                      <input
                        type="text"
                        value={form.openai.baseUrl}
                        onChange={(event) => setOpenAIField('baseUrl', event.target.value)}
                        placeholder="https://api.openai.com/v1"
                      />
                    </div>
                    <div className="settings-field">
                      <label>{t.modelField}</label>
                      <input
                        type="text"
                        value={form.openai.model}
                        onChange={(event) => setOpenAIField('model', event.target.value)}
                        placeholder="gpt-4o"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="settings-field">
                      <label>{t.apiKey}</label>
                      <input
                        type="password"
                        value={form.anthropic.apiKey}
                        onChange={(event) => setAnthropicField('apiKey', event.target.value)}
                        placeholder="sk-ant-..."
                      />
                    </div>
                    <div className="settings-field">
                      <label>
                        {t.baseUrl} <span className="field-optional">{t.optional}</span>
                      </label>
                      <input
                        type="text"
                        value={form.anthropic.baseUrl ?? ''}
                        onChange={(event) => setAnthropicField('baseUrl', event.target.value)}
                        placeholder="https://api.anthropic.com"
                      />
                    </div>
                    <div className="settings-field">
                      <label>{t.modelField}</label>
                      <input
                        type="text"
                        value={form.anthropic.model}
                        onChange={(event) => setAnthropicField('model', event.target.value)}
                        placeholder="claude-opus-4-6"
                      />
                    </div>
                  </>
                )}

                <div className="settings-field" style={{ marginTop: 12 }}>
                  <label>{t.maxIterations}</label>
                  <input
                    type="number"
                    min={0}
                    value={form.maxIterations ?? 0}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        maxIterations: Math.max(0, Number.parseInt(event.target.value, 10) || 0),
                      })}
                  />
                  <div className="field-hint">{t.maxIterationsHint}</div>
                </div>

                <div className="field-hint" style={{ marginTop: 8 }}>{t.restartHint}</div>
              </div>
            )}

            {activeSection === 'workspace' && (
              <div className="settings-section">
                <div className="settings-field">
                  <label>{t.pythonPath}</label>
                  <input
                    type="text"
                    value={form.python.path}
                    onChange={(event) => setPythonPath(event.target.value)}
                    placeholder="python"
                  />
                  <div className="field-hint">{t.pythonPathHint}</div>
                  {pythonStatus && (
                    <div className={`status-badge ${pythonStatus.available ? 'ok' : 'error'}`}>
                      {pythonStatus.available ? t.pythonStatusOk : t.pythonStatusError}
                      {pythonStatus.path ? `: ${pythonStatus.path}` : ''}
                    </div>
                  )}
                  <div className="field-hint">{t.pythonStatusHint}</div>
                </div>

                <div className="settings-field">
                  <label>{t.workspaceDir}</label>
                  <input
                    type="text"
                    value={form.workspace}
                    onChange={(event) => setWorkspace(event.target.value)}
                    placeholder="~/.asynagents/workspace"
                  />
                  <div className="field-hint">{t.workspaceDirHint}</div>
                </div>
              </div>
            )}

            {activeSection === 'knowledge' && (
              <div className="settings-section">
                <div className="settings-resource-group">
                  <div className="settings-section-title">{t.skillsManager}</div>
                  <div className="field-hint settings-group-hint">{t.skillsManagerHint}</div>
                  <div className="settings-resource-list">
                    {sortSkills(skills).map((skill) => (
                      <div className="settings-resource-item" key={skill.name}>
                        <div className="settings-resource-copy">
                          <div className="settings-resource-title">{skill.name}</div>
                          <div className="settings-resource-meta">
                            {skill.source === 'system' ? t.systemSource : t.userSource}
                          </div>
                          <div className="settings-resource-summary">
                            {skill.description || t.noDescription}
                          </div>
                        </div>
                        <button
                          type="button"
                          className={`toggle-switch ${skill.enabled ? 'on' : ''}`}
                          onClick={() => void handleToggleSkill(skill)}
                          disabled={togglingSkill === skill.name}
                          title={skill.enabled ? t.disable : t.enable}
                        >
                          <span className="toggle-knob" />
                        </button>
                      </div>
                    ))}
                    {skills.length === 0 && (
                      <div className="settings-empty-state">{t.noSkills}</div>
                    )}
                  </div>
                </div>

                <div className="settings-resource-group">
                  <div className="settings-section-title">{t.experiencesManager}</div>
                  <div className="field-hint settings-group-hint">{t.experiencesManagerHint}</div>
                  <div className="settings-resource-list">
                    {sortExperiences(experiences).map((experience) => (
                      <div className="settings-resource-item" key={experience.fileName}>
                        <div className="settings-resource-copy">
                          <div className="settings-resource-title">{experience.title}</div>
                          <div className="settings-resource-meta">{experience.fileName}</div>
                          <div className="settings-resource-summary">
                            {experience.summary || t.noDescription}
                          </div>
                          {experience.keywords.length > 0 && (
                            <div className="settings-resource-tags">
                              {experience.keywords.map((keyword) => (
                                <span className="settings-tag" key={keyword}>{keyword}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          className={`toggle-switch ${experience.enabled ? 'on' : ''}`}
                          onClick={() => void handleToggleExperience(experience)}
                          disabled={togglingExperience === experience.fileName}
                          title={experience.enabled ? t.disable : t.enable}
                        >
                          <span className="toggle-knob" />
                        </button>
                      </div>
                    ))}
                    {experiences.length === 0 && (
                      <div className="settings-empty-state">{t.noExperiences}</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'ui' && (
              <div className="settings-section">
                <div className="settings-field">
                  <label>{t.interfaceLanguage}</label>
                  <div className="provider-tabs">
                    <button
                      type="button"
                      className={`provider-tab ${ui.language === 'zh' ? 'active' : ''}`}
                      onClick={() => setUiField({ language: 'zh' })}
                    >
                      {t.langZh}
                    </button>
                    <button
                      type="button"
                      className={`provider-tab ${ui.language === 'en' ? 'active' : ''}`}
                      onClick={() => setUiField({ language: 'en' })}
                    >
                      {t.langEn}
                    </button>
                  </div>
                </div>

                <div className="settings-field">
                  <label>{t.userLanguageLabel}</label>
                  <div className="provider-tabs">
                    <button
                      type="button"
                      className={`provider-tab ${ui.userLanguage === 'auto' ? 'active' : ''}`}
                      onClick={() => setUiField({ userLanguage: 'auto' })}
                    >
                      {t.langAuto}
                    </button>
                    <button
                      type="button"
                      className={`provider-tab ${ui.userLanguage === 'zh' ? 'active' : ''}`}
                      onClick={() => setUiField({ userLanguage: 'zh' })}
                    >
                      {t.langZh}
                    </button>
                    <button
                      type="button"
                      className={`provider-tab ${ui.userLanguage === 'en' ? 'active' : ''}`}
                      onClick={() => setUiField({ userLanguage: 'en' })}
                    >
                      {t.langEn}
                    </button>
                  </div>
                  <div className="field-hint">{t.userLanguageHint}</div>
                </div>

                <div className="settings-field settings-field-toggle">
                  <div className="toggle-label">
                    <span>{t.showToolCallsByDefault}</span>
                    <span className="field-hint">{t.showToolCallsByDefaultHint}</span>
                  </div>
                  <button
                    type="button"
                    className={`toggle-switch ${ui.showToolCalls ? 'on' : ''}`}
                    onClick={() => setUiField({ showToolCalls: !ui.showToolCalls })}
                  >
                    <span className="toggle-knob" />
                  </button>
                </div>

                {ui.showToolCalls && (
                  <div className="settings-field settings-field-toggle">
                    <div className="toggle-label">
                      <span>{t.autoCollapseToolCalls}</span>
                      <span className="field-hint">{t.autoCollapseToolCallsHint}</span>
                    </div>
                    <button
                      type="button"
                      className={`toggle-switch ${ui.autoCollapseToolCalls ? 'on' : ''}`}
                      onClick={() =>
                        setUiField({ autoCollapseToolCalls: !ui.autoCollapseToolCalls })
                      }
                    >
                      <span className="toggle-knob" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeSection === 'persona' && (
              <div className="settings-section">
                <div className="settings-avatar-grid">
                  <div className="settings-field">
                    <label>{t.aiAvatar}</label>
                    <div className="settings-avatar-editor">
                      <button
                        type="button"
                        className="settings-avatar-preview"
                        onClick={() => aiAvatarInputRef.current?.click()}
                        title={t.uploadAvatar}
                      >
                        {persona.aiAvatar ? (
                          <img src={persona.aiAvatar} alt={t.aiAvatar} className="settings-avatar-image" />
                        ) : (
                          <BoltIcon size={18} />
                        )}
                      </button>
                      <div className="settings-avatar-actions">
                        <input
                          ref={aiAvatarInputRef}
                          type="file"
                          accept="image/*"
                          className="settings-avatar-input"
                          onChange={(event) => {
                            void handleAvatarSelected('aiAvatar', event.target.files?.[0]);
                            event.target.value = '';
                          }}
                        />
                        <button type="button" className="provider-tab" onClick={() => aiAvatarInputRef.current?.click()}>
                          {t.uploadAvatar}
                        </button>
                        <button type="button" className="provider-tab" onClick={() => setPersonaField('aiAvatar', '')}>
                          {t.removeAvatar}
                        </button>
                      </div>
                    </div>
                    <div className="field-hint">{t.avatarHint}</div>
                  </div>

                  <div className="settings-field">
                    <label>{t.userAvatar}</label>
                    <div className="settings-avatar-editor">
                      <button
                        type="button"
                        className="settings-avatar-preview user"
                        onClick={() => userAvatarInputRef.current?.click()}
                        title={t.uploadAvatar}
                      >
                        {persona.userAvatar ? (
                          <img src={persona.userAvatar} alt={t.userAvatar} className="settings-avatar-image" />
                        ) : (
                          <span className="settings-avatar-fallback-text">{(persona.userName || t.user).slice(0, 1)}</span>
                        )}
                      </button>
                      <div className="settings-avatar-actions">
                        <input
                          ref={userAvatarInputRef}
                          type="file"
                          accept="image/*"
                          className="settings-avatar-input"
                          onChange={(event) => {
                            void handleAvatarSelected('userAvatar', event.target.files?.[0]);
                            event.target.value = '';
                          }}
                        />
                        <button type="button" className="provider-tab" onClick={() => userAvatarInputRef.current?.click()}>
                          {t.uploadAvatar}
                        </button>
                        <button type="button" className="provider-tab" onClick={() => setPersonaField('userAvatar', '')}>
                          {t.removeAvatar}
                        </button>
                      </div>
                    </div>
                    <div className="field-hint">{t.avatarHint}</div>
                  </div>
                </div>

                <div className="settings-field">
                  <label>{t.aiName}</label>
                  <input
                    type="text"
                    maxLength={PERSONA_NAME_MAX_LENGTH}
                    value={persona.aiName}
                    onChange={(event) => setPersonaField('aiName', event.target.value)}
                    placeholder={t.aiNamePlaceholder}
                  />
                  <div className="field-hint">{t.aiNameHint}</div>
                  <div className="field-hint">{t.personaNameRule}</div>
                </div>
                <div className="settings-field">
                  <label>{t.userName}</label>
                  <input
                    type="text"
                    maxLength={PERSONA_NAME_MAX_LENGTH}
                    value={persona.userName}
                    onChange={(event) => setPersonaField('userName', event.target.value)}
                    placeholder={t.userNamePlaceholder}
                  />
                  <div className="field-hint">{t.userNameHint}</div>
                  <div className="field-hint">{t.personaNameRule}</div>
                </div>
                <div className="settings-field">
                  <label>{t.personality}</label>
                  <textarea
                    className="settings-textarea"
                    value={persona.personality}
                    onChange={(event) => setPersonaField('personality', event.target.value)}
                    placeholder={t.personalityPlaceholder}
                    rows={4}
                  />
                  <div className="field-hint">{t.personalityHint}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="settings-footer">
          {saveError && <div className="settings-error">{saveError}</div>}
          <div className="settings-actions">
            <button type="button" className="settings-cancel" onClick={onClose}>{t.cancel}</button>
            <button type="button" className="settings-save" onClick={handleSave} disabled={saving}>
              {saved ? t.saved : saving ? t.saving : t.save}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
