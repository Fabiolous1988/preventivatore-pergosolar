
export const STORAGE_KEY = 'fieldest_api_key';
export const STORAGE_CONFIG_KEY = 'fieldest_config_url';
export const STORAGE_MODELS_KEY = 'fieldest_models_config_url';
export const DEFAULT_API_KEY = 'AIzaSyC4O6LEnGIswMLYZIUI1GQD8FVUJ0TcgaM';

export const getStoredApiKey = (): string | null => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) return stored;
  return DEFAULT_API_KEY;
};

export const setStoredApiKey = (key: string) => {
  localStorage.setItem(STORAGE_KEY, key);
};

export const removeStoredApiKey = () => {
  localStorage.removeItem(STORAGE_KEY);
};

export const getStoredConfigUrl = (): string | null => {
  return localStorage.getItem(STORAGE_CONFIG_KEY);
};

export const setStoredConfigUrl = (url: string) => {
  localStorage.setItem(STORAGE_CONFIG_KEY, url);
};

export const removeStoredConfigUrl = () => {
  localStorage.removeItem(STORAGE_CONFIG_KEY);
};

export const getStoredModelsUrl = (): string | null => {
  return localStorage.getItem(STORAGE_MODELS_KEY);
};

export const setStoredModelsUrl = (url: string) => {
  localStorage.setItem(STORAGE_MODELS_KEY, url);
};

export const removeStoredModelsUrl = () => {
  localStorage.removeItem(STORAGE_MODELS_KEY);
};
