import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '@/stores/appStore';
import type { AppSettings } from '@/stores/appStore';
import './SettingsModal.less';

interface SettingsModalProps {
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const { settings, saveSettings } = useAppStore();
  const [form, setForm] = useState<AppSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings) {
      const copy = JSON.parse(JSON.stringify(settings));
      // 兜底：旧 config.json 可能没有 ui 字段
      if (!copy.ui) copy.ui = { showToolCalls: true };
      setForm(copy);
    }
  }, [settings]);

  if (!form) return null;

  const setProvider = (v: string) => setForm({ ...form, provider: v });
  const setAnthropicField = (k: keyof AppSettings['anthropic'], v: string) =>
    setForm({ ...form, anthropic: { ...form.anthropic, [k]: v } });
  const setOpenAIField = (k: keyof AppSettings['openai'], v: string) =>
    setForm({ ...form, openai: { ...form.openai, [k]: v } });
  const setWorkspace = (v: string) => setForm({ ...form, workspace: v });
  const setShowToolCalls = (v: boolean) =>
    setForm({ ...form, ui: { ...(form.ui ?? { showToolCalls: true }), showToolCalls: v } });

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
          <div className="settings-title">设置</div>
          <button className="settings-close" onClick={onClose}>✕</button>
        </div>

        <div className="settings-body">
          {/* 模型配置 */}
          <div className="settings-section">
            <div className="settings-section-title">模型配置</div>

            <div className="settings-field">
              <label>API 提供商</label>
              <div className="provider-tabs">
                <button
                  className={`provider-tab ${form.provider === 'openai' ? 'active' : ''}`}
                  onClick={() => setProvider('openai')}
                >
                  OpenAI 兼容
                </button>
                <button
                  className={`provider-tab ${form.provider === 'anthropic' ? 'active' : ''}`}
                  onClick={() => setProvider('anthropic')}
                >
                  Anthropic
                </button>
              </div>
            </div>

            {form.provider === 'openai' ? (
              <>
                <div className="settings-field">
                  <label>API Key</label>
                  <input
                    type="password"
                    value={form.openai.apiKey}
                    onChange={(e) => setOpenAIField('apiKey', e.target.value)}
                    placeholder="sk-..."
                  />
                </div>
                <div className="settings-field">
                  <label>Base URL</label>
                  <input
                    type="text"
                    value={form.openai.baseUrl}
                    onChange={(e) => setOpenAIField('baseUrl', e.target.value)}
                    placeholder="https://api.openai.com/v1"
                  />
                </div>
                <div className="settings-field">
                  <label>模型</label>
                  <input
                    type="text"
                    value={form.openai.model}
                    onChange={(e) => setOpenAIField('model', e.target.value)}
                    placeholder="gpt-4o"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="settings-field">
                  <label>API Key</label>
                  <input
                    type="password"
                    value={form.anthropic.apiKey}
                    onChange={(e) => setAnthropicField('apiKey', e.target.value)}
                    placeholder="sk-ant-..."
                  />
                </div>
                <div className="settings-field">
                  <label>Base URL <span className="field-optional">（可选）</span></label>
                  <input
                    type="text"
                    value={form.anthropic.baseUrl ?? ''}
                    onChange={(e) => setAnthropicField('baseUrl', e.target.value)}
                    placeholder="https://api.anthropic.com"
                  />
                </div>
                <div className="settings-field">
                  <label>模型</label>
                  <input
                    type="text"
                    value={form.anthropic.model}
                    onChange={(e) => setAnthropicField('model', e.target.value)}
                    placeholder="claude-opus-4-6"
                  />
                </div>
              </>
            )}
          </div>

          {/* 工作区 */}
          <div className="settings-section">
            <div className="settings-section-title">工作区</div>
            <div className="settings-field">
              <label>工作目录</label>
              <input
                type="text"
                value={form.workspace}
                onChange={(e) => setWorkspace(e.target.value)}
                placeholder="~/.asynagents/workspace"
              />
              <div className="field-hint">智能体创建和修改文件的默认目录</div>
            </div>
          </div>

          {/* 界面 */}
          <div className="settings-section">
            <div className="settings-section-title">界面</div>
            <div className="settings-field settings-field-toggle">
              <div className="toggle-label">
                <span>默认展开工具调用过程</span>
                <span className="field-hint">每条消息的工具调用区域是否默认展开</span>
              </div>
              <button
                className={`toggle-switch ${form.ui.showToolCalls ? 'on' : ''}`}
                onClick={() => setShowToolCalls(!form.ui.showToolCalls)}
              >
                <span className="toggle-knob" />
              </button>
            </div>
          </div>
        </div>

        <div className="settings-footer">
          <div className="settings-hint">修改模型配置后需重启服务器生效</div>
          <div className="settings-actions">
            <button className="settings-cancel" onClick={onClose}>取消</button>
            <button className="settings-save" onClick={handleSave} disabled={saving}>
              {saved ? '已保存 ✓' : saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
