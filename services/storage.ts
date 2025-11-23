
export const STORAGE_KEY = 'fieldest_api_key';

export const getStoredApiKey = (): string | null => {
  return localStorage.getItem(STORAGE_KEY);
};

export const setStoredApiKey = (key: string) => {
  localStorage.setItem(STORAGE_KEY, key);
};

export const removeStoredApiKey = () => {
  localStorage.removeItem(STORAGE_KEY);
};
