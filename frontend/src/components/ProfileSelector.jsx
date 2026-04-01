import { useState, useEffect } from 'react';
import { api } from '../api';
import './ProfileSelector.css';

/**
 * ProfileSelector handles:
 * 1. Welcome screen (full-page gate when no profile selected)
 * 2. Profile picker modal (from sidebar)
 * 3. Create profile form
 * 4. PIN setup / verification
 */
export default function ProfileSelector({
  mode = 'welcome', // 'welcome' | 'modal'
  currentProfileId,
  onSelectProfile,
  onClose,
}) {
  const [profiles, setProfiles] = useState([]);
  const [view, setView] = useState('list'); // 'list' | 'create' | 'pin-verify' | 'pin-setup'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Create form state
  const [name, setName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [mgmtKey, setMgmtKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [validating, setValidating] = useState(false);

  // PIN state
  const [pin, setPin] = useState('');
  const [pinTarget, setPinTarget] = useState(null); // profile being verified/setup

  useEffect(() => {
    loadProfiles();
  }, []);

  async function loadProfiles() {
    try {
      setLoading(true);
      const data = await api.listProfiles();
      setProfiles(data.profiles || []);
    } catch (e) {
      setError('Failed to load profiles');
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectProfile(profile) {
    setError('');
    // If profile has PIN, require verification
    if (profile.has_pin && profile.id !== currentProfileId) {
      setPinTarget(profile);
      setPin('');
      setView('pin-verify');
      return;
    }
    onSelectProfile(profile);
  }

  async function handleVerifyPin() {
    if (!pin || !pinTarget) return;
    setError('');
    try {
      await api.verifyPin(pinTarget.id, pin);
      onSelectProfile(pinTarget);
    } catch (e) {
      setError(e.message || 'Incorrect PIN');
    }
  }

  async function handleCreateProfile() {
    if (!name.trim() || !apiKey.trim()) return;
    setError('');
    setValidating(true);
    try {
      const profile = await api.createProfile(name.trim(), apiKey.trim(), mgmtKey.trim() || null);
      // If this is the first non-owner profile or welcome mode, select it
      onSelectProfile(profile);
    } catch (e) {
      setError(e.message || 'Failed to create profile');
    } finally {
      setValidating(false);
    }
  }

  async function handleSetPin() {
    if (!pin || pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
      setError('PIN must be 4-6 digits');
      return;
    }
    setError('');
    try {
      await api.setPin(pinTarget.id, pin);
      if (mode === 'modal') {
        // Refresh profiles to show updated PIN badge, go back to list
        await loadProfiles();
        setView('list');
        setPin('');
      } else {
        onSelectProfile(pinTarget);
      }
    } catch (e) {
      setError(e.message || 'Failed to set PIN');
    }
  }

  function renderProfileList() {
    return (
      <>
        <div className="ps-profile-list">
          {profiles.map((p) => (
            <div
              key={p.id}
              className={`ps-profile-item${p.id === currentProfileId ? ' active' : ''}`}
              onClick={() => handleSelectProfile(p)}
            >
              <div className={`ps-profile-avatar${p.is_owner ? ' owner' : ''}`}>
                {(p.name || '?')[0].toUpperCase()}
              </div>
              <div className="ps-profile-info">
                <div className="ps-profile-name">{p.name}</div>
                <div className="ps-profile-key">{p.openrouter_api_key || 'No key'}</div>
              </div>
              <div className="ps-profile-badges">
                {p.is_owner && <span className="ps-badge owner">Owner</span>}
                {p.has_pin && <span className="ps-badge pin">PIN</span>}
                {p.id === currentProfileId && (
                  <button
                    className="ps-pin-action"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPinTarget(p);
                      setPin('');
                      setError('');
                      setView('pin-setup');
                    }}
                    title={p.has_pin ? 'Change PIN' : 'Set PIN'}
                  >
                    {p.has_pin ? 'Change PIN' : 'Set PIN'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <button className="ps-add-btn" onClick={() => { setView('create'); setError(''); }}>
          + Add Profile
        </button>
      </>
    );
  }

  function renderCreateForm() {
    return (
      <div className="ps-form">
        <div className="ps-field">
          <label>Display Name</label>
          <input
            className="ps-input"
            type="text"
            placeholder="e.g. John, Guest, Work"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
        <div className="ps-field">
          <label>OpenRouter API Key</label>
          <div className="ps-key-wrapper">
            <input
              className="ps-input"
              type={showKey ? 'text' : 'password'}
              placeholder="sk-or-v1-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <button className="ps-key-toggle" onClick={() => setShowKey(!showKey)} type="button">
              {showKey ? '🙈' : '👁'}
            </button>
          </div>
          <span className="ps-hint">Your key is validated against OpenRouter and stored locally. It is never shared.</span>
        </div>
        <div className="ps-field">
          <label>Management Key (Optional)</label>
          <input
            className="ps-input"
            type="password"
            placeholder="sk-or-v1-... (for credit tracking)"
            value={mgmtKey}
            onChange={(e) => setMgmtKey(e.target.value)}
          />
        </div>
        {error && <div className="ps-error">{error}</div>}
        <div className="ps-actions">
          <button className="ps-secondary-btn" onClick={() => { setView('list'); setError(''); }}>
            Back
          </button>
          <button
            className="ps-primary-btn"
            disabled={!name.trim() || !apiKey.trim() || validating}
            onClick={handleCreateProfile}
          >
            {validating ? 'Validating...' : 'Create Profile'}
          </button>
        </div>
      </div>
    );
  }

  function renderPinVerify() {
    return (
      <div className="ps-form">
        <p className="ps-subtitle">
          Enter the PIN to access <strong>{pinTarget?.name}</strong>'s profile.
        </p>
        <div className="ps-field">
          <label>PIN</label>
          <input
            className="ps-pin-input"
            type="password"
            maxLength={6}
            placeholder="****"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && handleVerifyPin()}
            autoFocus
          />
        </div>
        {error && <div className="ps-error">{error}</div>}
        <div className="ps-actions">
          <button className="ps-secondary-btn" onClick={() => { setView('list'); setError(''); setPin(''); }}>
            Back
          </button>
          <button className="ps-primary-btn" disabled={pin.length < 4} onClick={handleVerifyPin}>
            Unlock
          </button>
        </div>
      </div>
    );
  }

  function renderPinSetup() {
    const isFromModal = mode === 'modal';
    return (
      <div className="ps-form">
        <p className="ps-subtitle">
          Set a 4-6 digit PIN to protect your profile from other users.
        </p>
        <div className="ps-field">
          <label>Choose PIN</label>
          <input
            className="ps-pin-input"
            type="password"
            maxLength={6}
            placeholder="****"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && handleSetPin()}
            autoFocus
          />
        </div>
        {error && <div className="ps-error">{error}</div>}
        <div className="ps-actions">
          <button
            className="ps-secondary-btn"
            onClick={() => {
              if (isFromModal) {
                setView('list');
                setError('');
                setPin('');
              } else {
                onSelectProfile(pinTarget);
              }
            }}
          >
            {isFromModal ? 'Back' : 'Skip for now'}
          </button>
          <button className="ps-primary-btn" disabled={pin.length < 4} onClick={handleSetPin}>
            Set PIN
          </button>
        </div>
      </div>
    );
  }

  function renderContent() {
    if (loading) {
      return <p className="ps-subtitle">Loading profiles...</p>;
    }

    switch (view) {
      case 'create':
        return renderCreateForm();
      case 'pin-verify':
        return renderPinVerify();
      case 'pin-setup':
        return renderPinSetup();
      default:
        return renderProfileList();
    }
  }

  // Welcome mode: full-page gate
  if (mode === 'welcome') {
    // If owner profile exists but has no PIN, offer PIN setup after selection
    const ownerProfile = profiles.find((p) => p.is_owner);
    const needsPinSetup = ownerProfile && !ownerProfile.has_pin && view === 'list';

    // Override handleSelectProfile for welcome mode to trigger PIN setup for owner
    const welcomeSelect = (profile) => {
      if (profile.is_owner && !profile.has_pin) {
        setPinTarget(profile);
        setPin('');
        setView('pin-setup');
        return;
      }
      handleSelectProfile(profile);
    };

    return (
      <div className="ps-welcome">
        <div className="ps-welcome-inner">
          <h1 className="ps-welcome-title">Split Bench</h1>
          <p className="ps-welcome-subtitle">
            {view === 'list'
              ? 'Select a profile to get started, or create a new one with your OpenRouter key.'
              : view === 'pin-setup'
              ? 'Protect your owner profile with a PIN.'
              : ''}
          </p>
          {error && view === 'list' && <div className="ps-error" style={{ marginBottom: 16 }}>{error}</div>}
          {view === 'list' && (
            <>
              <div className="ps-profile-list">
                {profiles.map((p) => (
                  <div
                    key={p.id}
                    className="ps-profile-item"
                    onClick={() => welcomeSelect(p)}
                  >
                    <div className={`ps-profile-avatar${p.is_owner ? ' owner' : ''}`}>
                      {(p.name || '?')[0].toUpperCase()}
                    </div>
                    <div className="ps-profile-info">
                      <div className="ps-profile-name">{p.name}</div>
                      <div className="ps-profile-key">{p.openrouter_api_key || 'No key'}</div>
                    </div>
                    <div className="ps-profile-badges">
                      {p.is_owner && <span className="ps-badge owner">Owner</span>}
                    </div>
                  </div>
                ))}
              </div>
              <button className="ps-add-btn" onClick={() => { setView('create'); setError(''); }}>
                + Add Profile
              </button>
            </>
          )}
          {view === 'create' && renderCreateForm()}
          {view === 'pin-setup' && renderPinSetup()}
          {view === 'pin-verify' && renderPinVerify()}
        </div>
      </div>
    );
  }

  // Modal mode: overlay
  return (
    <div className="ps-overlay" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="ps-panel">
        <div className="ps-header">
          <h2>{view === 'list' ? 'Switch Profile' : view === 'create' ? 'New Profile' : 'Enter PIN'}</h2>
          {onClose && (
            <button className="ps-close" onClick={onClose}>&times;</button>
          )}
        </div>
        <div className="ps-body">
          {error && view === 'list' && <div className="ps-error" style={{ marginBottom: 16 }}>{error}</div>}
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
