// Caption preset management for the popup. Pure: every function returns new data.
// state = { customPresets: [{ id, name, style }], builtInPresetEdits: { [builtInId]: style } }.
// Load after lib/caption-style.js.
(function (root) {
  const inNode = typeof module !== 'undefined' && module.exports;
  const { BUILT_IN_PRESETS, normalizeStyle, stylesEqual } = inNode ? require('./caption-style.js') : root.BrowserBuddy.captionStyle;
  const MAX_NAME = 24;
  const MAX_CUSTOM = 20;
  const builtIn = (id) => BUILT_IN_PRESETS.find((preset) => preset.id === id);

  function listPresets({ customPresets = [], builtInPresetEdits = {} }) {
    const builtIns = BUILT_IN_PRESETS.map((preset) => {
      const edit = builtInPresetEdits[preset.id];
      return { id: preset.id, name: preset.name, style: edit ? normalizeStyle(edit) : preset.style, builtIn: true, edited: !!edit };
    });
    return [...builtIns, ...customPresets.map((preset) => ({ ...preset, builtIn: false, edited: false }))];
  }

  function validateName(state, name, exceptId) {
    const trimmed = String(name || '').trim();
    if (!trimmed) return 'empty';
    if (trimmed.length > MAX_NAME) return 'too-long';
    const taken = listPresets(state).some((preset) => preset.id !== exceptId && preset.name.toLowerCase() === trimmed.toLowerCase());
    return taken ? 'duplicate' : null;
  }

  function createPreset(state, name, style, id) {
    const error = validateName(state, name);
    if (error) return { error };
    if (state.customPresets.length >= MAX_CUSTOM) return { error: 'limit' };
    const preset = { id, name: String(name).trim(), style: normalizeStyle(style) };
    return { state: { ...state, customPresets: [...state.customPresets, preset] }, preset };
  }

  function renamePreset(state, id, name) {
    if (builtIn(id)) return { error: 'built-in' };
    const error = validateName(state, name, id);
    if (error) return { error };
    return { state: { ...state, customPresets: state.customPresets.map((p) => (p.id === id ? { ...p, name: String(name).trim() } : p)) } };
  }

  function updatePresetStyle(state, id, style) {
    const normalized = normalizeStyle(style);
    const original = builtIn(id);
    if (original) {
      const { [id]: _previous, ...others } = state.builtInPresetEdits;
      const builtInPresetEdits = stylesEqual(normalized, original.style) ? others : { ...others, [id]: normalized };
      return { state: { ...state, builtInPresetEdits } };
    }
    return { state: { ...state, customPresets: state.customPresets.map((p) => (p.id === id ? { ...p, style: normalized } : p)) } };
  }

  function deletePreset(state, id) {
    if (builtIn(id)) return { error: 'built-in' };
    return { state: { ...state, customPresets: state.customPresets.filter((p) => p.id !== id) } };
  }

  function resetBuiltIn(state, id) {
    const { [id]: _removed, ...builtInPresetEdits } = state.builtInPresetEdits;
    return { state: { ...state, builtInPresetEdits } };
  }

  function applyPreset(settings, id) {
    const preset = listPresets(settings).find((p) => p.id === id);
    return preset ? { captionStyle: preset.style, captionPresetId: id } : {};
  }

  function afterDelete(settings, deletedId) {
    return { captionPresetId: settings.captionPresetId === deletedId ? null : settings.captionPresetId };
  }

  const api = { MAX_NAME, MAX_CUSTOM, listPresets, validateName, createPreset, renamePreset, updatePresetStyle, deletePreset, resetBuiltIn, applyPreset, afterDelete };
  if (inNode) module.exports = api;
  else (root.BrowserBuddy = root.BrowserBuddy || {}).presets = api;
})(globalThis);
